import { describe, expect, it } from 'vitest'
import { createNativeEngineService, resolveStockfishPath } from './native'

/**
 * Runs the real native Stockfish. Opt-in, because it executes a downloaded binary:
 *   bun run engine:native && STOCKFISH_INTEGRATION=1 bun run test
 */
describe.skipIf(!process.env.STOCKFISH_INTEGRATION)('native Stockfish (integration)', () => {
  const service = createNativeEngineService({
    path: resolveStockfishPath(process.env.STOCKFISH_PATH),
    poolSize: 4,
    hashMb: 32,
  })

  it('evaluates positions in parallel, deterministically', async () => {
    const status = await service.status()
    expect(status).toMatchObject({ available: true, parallelism: 4 })
    const fens = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      '7k/6pp/8/8/8/8/8/R5K1 w - - 0 1',
      'r2q1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 9',
    ]
    const first = await service.evaluate({ fens, nodes: 200_000, multiPv: 2 })
    expect(first[1]?.lines[0]).toMatchObject({
      pv: ['a1a8'],
      score: { type: 'mate', winner: 'white', moves: 1 },
    })
    const again = await service.evaluate({ fens: [...fens].reverse(), nodes: 200_000, multiPv: 2 })
    expect([...again].reverse()).toEqual(first) // same answers regardless of order and process
  }, 60_000)
})
