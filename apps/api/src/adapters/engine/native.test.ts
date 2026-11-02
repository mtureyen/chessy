import { fileURLToPath } from 'node:url'
import { EnginePoolEvaluator, UciEngine, type PositionEvaluator } from '@chessy/analysis'
import { describe, expect, it } from 'vitest'
import { createNativeEngineService } from './native'
import { SerialEngineService } from './service'
import { createProcessTransport } from './processTransport'

const FAKE_UCI = fileURLToPath(new URL('./fixtures/fake-uci.mjs', import.meta.url))
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** Runs the fake engine script with the current runtime (Node under Vitest). */
const fakeEngine = (mode = 'ok') =>
  new UciEngine(
    () => {
      process.env.FAKE_UCI_MODE = mode
      return createProcessTransport(process.execPath, [FAKE_UCI])
    },
    { initTimeoutMs: 5_000 },
  )

describe('process transport', () => {
  it('speaks UCI with a child process', async () => {
    const engine = fakeEngine()
    expect(await engine.init()).toEqual({ name: 'FakeUCI 1' })
    const result = await engine.analyze({ fen: START, nodes: 1234, multiPv: 2, fresh: true }).result
    expect(result).toMatchObject({ end: 'limit', bestMove: 'e2e4', depth: 7 })
    expect(result.lines.map((l) => l.score)).toEqual([
      { type: 'cp', value: 10 },
      { type: 'cp', value: 20 },
    ])
    engine.dispose()
  })

  it('reports a crashing engine as an error', async () => {
    const engine = fakeEngine('crash')
    const result = await engine.analyze({ fen: START, nodes: 10 }).result
    expect(result.end).toBe('error')
    expect(result.error).toMatch(/exited unexpectedly/)
  })

  it('reports a missing binary as an error', async () => {
    const engine = new UciEngine(() => createProcessTransport('/nonexistent/stockfish'), {
      initTimeoutMs: 5_000,
    })
    await expect(engine.init()).rejects.toThrow(/could not be started/)
  })
})

describe('native engine service', () => {
  it('is available with a working engine and evaluates through a pool of processes', async () => {
    const service = new SerialEngineService(new EnginePoolEvaluator([fakeEngine(), fakeEngine()]))
    expect(await service.status()).toEqual({ available: true, name: 'FakeUCI 1', parallelism: 2 })
    const evals = await service.evaluate({ fens: [START, START, START], nodes: 100, multiPv: 1 })
    expect(evals).toHaveLength(3)
    expect(evals.every((e) => e.lines[0]?.pv[0] === 'e2e4')).toBe(true)
  })

  it('is unavailable (not failing) without a binary', async () => {
    const service = createNativeEngineService({
      path: '/nonexistent/stockfish',
      poolSize: 2,
      hashMb: 16,
    })
    const status = await service.status()
    expect(status).toMatchObject({ available: false })
    expect(status.available === false && status.reason).toMatch(/could not be started/)
  })

  it('runs one batch at a time', async () => {
    const order: string[] = []
    let release!: () => void
    const evaluator: PositionEvaluator = {
      describe: async () => ({ name: 'x', parallelism: 1 }),
      evaluate: async (request) => {
        order.push(`start ${request.nodes}`)
        if (request.nodes === 1) await new Promise<void>((resolve) => (release = resolve))
        order.push(`end ${request.nodes}`)
        return []
      },
    }
    const service = new SerialEngineService(evaluator)
    const first = service.evaluate({ fens: [START], nodes: 1, multiPv: 1 })
    const second = service.evaluate({ fens: [START], nodes: 2, multiPv: 1 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(order).toEqual(['start 1'])
    release()
    await Promise.all([first, second])
    expect(order).toEqual(['start 1', 'end 1', 'start 2', 'end 2'])
  })
})
