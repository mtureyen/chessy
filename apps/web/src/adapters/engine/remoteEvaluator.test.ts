import { EngineFailedError, EvaluationCancelledError } from '@pawnia/analysis'
import { afterEach, describe, expect, it } from 'vitest'
import { createApiClient } from '@/adapters/api/client'
import { RemoteEvaluator } from './remoteEvaluator'

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})
const evalOf = (depth: number) => ({ depth, lines: [] })

/** A Response whose NDJSON body arrives in awkward chunks, like over a real network. */
function ndjson(lines: object[], chunkSize = 7): Response {
  const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
  const chunks = text.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, 'g'))!
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } })
}

function setup(respond: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    return respond(url, init)
  }) as typeof fetch
  const api = createApiClient('http://api.test')
  // The typed client uses the global fetch; route it to the fake as well.
  globalThis.fetch = fetchImpl
  return { evaluator: new RemoteEvaluator(api, 'http://api.test', fetchImpl), calls }
}

describe('RemoteEvaluator', () => {
  it('describes the server engine, or fails when there is none', async () => {
    const ok = setup(() => Response.json({ available: true, name: 'Stockfish 19', parallelism: 8 }))
    expect(await ok.evaluator.describe()).toEqual({ name: 'Stockfish 19', parallelism: 8 })
    const none = setup(() => Response.json({ available: false, reason: 'no binary' }))
    await expect(none.evaluator.describe()).rejects.toThrow(/no binary/)
  })

  it('reads the event stream, in any order, across chunk boundaries', async () => {
    const { evaluator, calls } = setup(() =>
      ndjson([
        { type: 'evaluated', index: 1, eval: evalOf(11) },
        { type: 'evaluated', index: 0, eval: evalOf(10) },
        { type: 'done' },
      ]),
    )
    const seen: number[] = []
    const results = await evaluator.evaluate(
      { fens: [FEN, FEN], nodes: 500_000, multiPv: 2 },
      { onEvaluated: (i) => seen.push(i) },
    )
    expect(results.map((r) => r.depth)).toEqual([10, 11])
    expect(seen).toEqual([1, 0])
    expect(calls[0]?.url).toBe('http://api.test/api/v1/engine/evaluations')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      fens: [FEN, FEN],
      nodes: 500_000,
      multiPv: 2,
    })
  })

  it('turns error events, HTTP problems and broken streams into EngineFailedError', async () => {
    const failing = setup(() => ndjson([{ type: 'error', message: 'engine crashed' }]))
    await expect(failing.evaluator.evaluate({ fens: [FEN], nodes: 1, multiPv: 1 })).rejects.toThrow(
      'engine crashed',
    )

    const unavailable = setup(() =>
      Response.json({ title: 'Engine unavailable', detail: 'no binary' }, { status: 503 }),
    )
    await expect(
      unavailable.evaluator.evaluate({ fens: [FEN], nodes: 1, multiPv: 1 }),
    ).rejects.toThrow('no binary')

    const cut = setup(() => ndjson([{ type: 'evaluated', index: 0, eval: evalOf(1) }]))
    await expect(
      cut.evaluator.evaluate({ fens: [FEN, FEN], nodes: 1, multiPv: 1 }),
    ).rejects.toBeInstanceOf(EngineFailedError)
  })

  it('aborts the request when cancelled', async () => {
    const { evaluator, calls } = setup(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    )
    const controller = new AbortController()
    const running = evaluator.evaluate(
      { fens: [FEN], nodes: 1, multiPv: 1 },
      { signal: controller.signal },
    )
    controller.abort()
    await expect(running).rejects.toBeInstanceOf(EvaluationCancelledError)
    expect(calls[0]?.init?.signal?.aborted).toBe(true)
  })
})
