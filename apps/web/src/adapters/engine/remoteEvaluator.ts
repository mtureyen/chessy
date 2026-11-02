import {
  EngineFailedError,
  EvaluationCancelledError,
  type EvaluateOptions,
  type EvaluationRequest,
  type EvaluatorInfo,
  type PositionEval,
  type PositionEvaluator,
} from '@chessy/analysis'
import type { EngineStatusBody, EvaluationEvent } from '@chessy/contracts'
import type { ApiClient } from '@/adapters/api/client'

/**
 * PositionEvaluator backed by the API's native engine pool. Results arrive as an NDJSON stream;
 * cancelling closes the connection, which stops the work on the server.
 */
export class RemoteEvaluator implements PositionEvaluator {
  private readonly api: ApiClient
  private readonly baseUrl: string
  private readonly fetch: typeof fetch

  constructor(api: ApiClient, baseUrl: string, fetchImpl: typeof fetch = fetch.bind(globalThis)) {
    this.api = api
    this.baseUrl = baseUrl
    this.fetch = fetchImpl
  }

  async describe(): Promise<EvaluatorInfo> {
    let status: EngineStatusBody
    try {
      status = (await (await this.api.api.v1.engine.$get()).json()) as EngineStatusBody
    } catch (error) {
      throw new EngineFailedError(`Chessy API unreachable: ${String(error)}`)
    }
    if (!status.available)
      throw new EngineFailedError(`No native engine on the server: ${status.reason}`)
    return { name: status.name, parallelism: status.parallelism }
  }

  async evaluate(
    request: EvaluationRequest,
    options: EvaluateOptions = {},
  ): Promise<PositionEval[]> {
    const abort = new AbortController()
    const onAbort = () => abort.abort()
    options.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await this.fetch(`${this.baseUrl}/api/v1/engine/evaluations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fens: request.fens,
          nodes: request.nodes,
          multiPv: request.multiPv,
        }),
        signal: abort.signal,
      })
      if (!res.ok || !res.body) {
        const problem = (await res.json().catch(() => ({}))) as { detail?: string; title?: string }
        throw new EngineFailedError(problem.detail ?? problem.title ?? `HTTP ${res.status}`)
      }
      return await readEvents(res.body, request.fens.length, options)
    } catch (error) {
      if (options.signal?.aborted) throw new EvaluationCancelledError()
      if (error instanceof EngineFailedError) throw error
      throw new EngineFailedError(`Server evaluation failed: ${String(error)}`)
    } finally {
      options.signal?.removeEventListener('abort', onAbort)
    }
  }
}

async function readEvents(
  body: ReadableStream<Uint8Array>,
  count: number,
  options: EvaluateOptions,
): Promise<PositionEval[]> {
  const results: (PositionEval | undefined)[] = new Array(count)
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
      const line = buffer.slice(0, end).trim()
      buffer = buffer.slice(end + 1)
      if (!line) continue
      const event = JSON.parse(line) as EvaluationEvent
      if (event.type === 'error') throw new EngineFailedError(event.message)
      if (event.type === 'evaluated') {
        results[event.index] = event.eval
        options.onEvaluated?.(event.index, event.eval)
      }
      if (event.type === 'done') {
        if (results.some((r) => r === undefined))
          throw new EngineFailedError('The server skipped positions')
        return results as PositionEval[]
      }
    }
  }
  throw new EngineFailedError('The server closed the stream early')
}
