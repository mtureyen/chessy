import type { PositionEval } from '../domain/review/types'
import type { EngineProvider } from '../ports/engine'
import {
  EngineFailedError,
  EvaluationCancelledError,
  type CancelSignal,
  type EvaluateOptions,
  type EvaluationRequest,
  type EvaluatorInfo,
  type PositionEvaluator,
} from '../ports/evaluator'

/**
 * PositionEvaluator over one or more engines: each engine takes the next open position until
 * none are left. One engine = positions one after another (browser); N engines = N in parallel
 * (server). Every search starts fresh, so results are identical either way.
 */
export class EnginePoolEvaluator implements PositionEvaluator {
  private readonly engines: readonly EngineProvider[]

  constructor(engines: readonly EngineProvider[]) {
    if (engines.length === 0) throw new Error('EnginePoolEvaluator needs at least one engine')
    this.engines = engines
  }

  async describe(): Promise<EvaluatorInfo> {
    const info = await this.engines[0]!.init()
    return { name: info.name, parallelism: this.engines.length }
  }

  async evaluate(
    request: EvaluationRequest,
    options: EvaluateOptions = {},
  ): Promise<PositionEval[]> {
    const results: PositionEval[] = new Array(request.fens.length)
    const internal = new CancelController(options.signal)
    let next = 0

    const worker = async (engine: EngineProvider) => {
      while (next < request.fens.length) {
        if (internal.aborted) return
        const index = next++
        const value = await evaluateOne(engine, request.fens[index]!, request, internal)
        results[index] = value
        options.onEvaluated?.(index, value)
      }
    }

    try {
      await Promise.all(this.engines.map(worker))
    } catch (error) {
      internal.abort() // stop the other engines
      throw error
    } finally {
      internal.dispose()
    }
    if (options.signal?.aborted) throw new EvaluationCancelledError()
    return results
  }
}

async function evaluateOne(
  engine: EngineProvider,
  fen: string,
  request: EvaluationRequest,
  signal: CancelController,
): Promise<PositionEval> {
  if (signal.aborted) throw new EvaluationCancelledError()
  const handle = engine.analyze({
    fen,
    nodes: request.nodes,
    multiPv: request.multiPv,
    fresh: true,
  })
  const stop = () => handle.stop()
  signal.onAbort(stop)
  const result = await handle.result
  signal.offAbort(stop)

  if (signal.aborted) throw new EvaluationCancelledError()
  if (result.end === 'error') throw new EngineFailedError(result.error ?? 'Engine failed')
  if (result.end === 'superseded')
    throw new EngineFailedError('The engine was taken over by another analysis')
  return { lines: result.lines, depth: result.depth }
}

/** Combines the caller's signal with our own "stop everything after an error". */
class CancelController {
  private readonly listeners = new Set<() => void>()
  private readonly parent: CancelSignal | undefined
  private readonly onParentAbort = () => this.abort()
  private stopped = false

  constructor(parent: CancelSignal | undefined) {
    this.parent = parent
    parent?.addEventListener('abort', this.onParentAbort, { once: true })
  }

  get aborted(): boolean {
    return this.stopped || !!this.parent?.aborted
  }

  abort(): void {
    if (this.stopped) return
    this.stopped = true
    for (const listener of this.listeners) listener()
  }

  /** Runs `listener` on abort, or right away if already aborted. */
  onAbort(listener: () => void): void {
    this.listeners.add(listener)
    if (this.aborted) listener()
  }

  offAbort(listener: () => void): void {
    this.listeners.delete(listener)
  }

  dispose(): void {
    this.parent?.removeEventListener('abort', this.onParentAbort)
  }
}
