import { describe, expect, it } from 'vitest'
import type { AnalysisRequest, AnalysisSnapshot } from '../domain/analysis'
import type { EngineProvider } from '../ports/engine'
import { EngineFailedError, EvaluationCancelledError, type CancelSignal } from '../ports/evaluator'
import { EnginePoolEvaluator } from './enginePoolEvaluator'

const FENS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
  'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq - 0 1',
  'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1',
]

/** An engine whose searches the test resolves by hand; scores encode which engine answered. */
function manualEngine(id: number, fail?: string) {
  const pending: {
    request: AnalysisRequest
    resolve: (s: AnalysisSnapshot) => void
    stopped: boolean
  }[] = []
  const engine: EngineProvider = {
    init: async () => ({ name: 'Fake 1' }),
    dispose: () => {},
    analyze(request) {
      let resolve!: (s: AnalysisSnapshot) => void
      const result = new Promise<AnalysisSnapshot>((r) => (resolve = r))
      const entry = { request, resolve, stopped: false }
      pending.push(entry)
      return {
        result,
        stop: () => {
          entry.stopped = true
          resolve({ fen: request.fen, depth: 0, lines: [], end: 'stopped' })
        },
      }
    },
  }
  const answer = () => {
    const entry = pending.find((p) => !p.stopped)!
    pending.splice(pending.indexOf(entry), 1)
    entry.resolve(
      fail
        ? { fen: entry.request.fen, depth: 0, lines: [], end: 'error', error: fail }
        : {
            fen: entry.request.fen,
            depth: 12,
            lines: [{ rank: 1, depth: 12, score: { type: 'cp', value: id }, pv: ['e2e4'] }],
            end: 'limit',
          },
    )
  }
  return { engine, pending, answer }
}

const settle = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0))

function cancellable() {
  const listeners = new Set<() => void>()
  const signal: CancelSignal & { aborted: boolean } = {
    aborted: false,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  }
  return {
    signal,
    abort() {
      signal.aborted = true
      for (const listener of listeners) listener()
    },
  }
}

describe('EnginePoolEvaluator', () => {
  it('describes itself by engine name and pool size', async () => {
    const pool = new EnginePoolEvaluator([manualEngine(1).engine, manualEngine(2).engine])
    expect(await pool.describe()).toEqual({ name: 'Fake 1', parallelism: 2 })
  })

  it('spreads positions over all engines and returns results in order', async () => {
    const a = manualEngine(1)
    const b = manualEngine(2)
    const done: number[] = []
    const running = new EnginePoolEvaluator([a.engine, b.engine]).evaluate(
      { fens: FENS, nodes: 100, multiPv: 2 },
      { onEvaluated: (i) => done.push(i) },
    )
    await settle()
    expect(a.pending).toHaveLength(1)
    expect(b.pending).toHaveLength(1) // both busy at the same time
    expect(a.pending[0]!.request).toMatchObject({ nodes: 100, multiPv: 2, fresh: true })

    b.answer() // position 1 finishes first
    await settle()
    for (let i = 0; i < 4; i++) {
      ;(a.pending.length ? a : b).answer()
      await settle()
    }
    const results = await running
    expect(results).toHaveLength(5)
    expect(results.map((r) => r.lines[0]?.score)).toContainEqual({ type: 'cp', value: 2 })
    expect(results[1]?.lines[0]?.score).toEqual({ type: 'cp', value: 2 })
    expect(done[0]).toBe(1)
    expect([...done].sort()).toEqual([0, 1, 2, 3, 4])
  })

  it('stops all engines when cancelled', async () => {
    const a = manualEngine(1)
    const b = manualEngine(2)
    const control = cancellable()
    const running = new EnginePoolEvaluator([a.engine, b.engine]).evaluate(
      { fens: FENS, nodes: 100, multiPv: 1 },
      { signal: control.signal },
    )
    await settle()
    control.abort()
    await expect(running).rejects.toBeInstanceOf(EvaluationCancelledError)
    expect(a.pending.every((p) => p.stopped) && b.pending.every((p) => p.stopped)).toBe(true)
  })

  it('fails on the first engine error and stops the others', async () => {
    const good = manualEngine(1)
    const bad = manualEngine(2, 'process exited')
    const running = new EnginePoolEvaluator([good.engine, bad.engine]).evaluate({
      fens: FENS,
      nodes: 100,
      multiPv: 1,
    })
    await settle()
    bad.answer()
    await expect(running).rejects.toBeInstanceOf(EngineFailedError)
    expect(good.pending.every((p) => p.stopped)).toBe(true)
  })

  it('needs at least one engine', () => {
    expect(() => new EnginePoolEvaluator([])).toThrow()
  })
})
