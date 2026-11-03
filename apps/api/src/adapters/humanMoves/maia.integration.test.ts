import { describe, expect, it } from 'vitest'
import { createMaiaService } from './maia'

/**
 * Runs the real Maia-3 model. Opt-in, because it needs the downloaded model:
 *   bun run maia:fetch && MAIA_INTEGRATION=1 bun run test
 */
describe.skipIf(!process.env.MAIA_INTEGRATION)('Maia-3 (integration)', () => {
  const service = createMaiaService(process.env.MAIA_MODEL_PATH)
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

  it('rates common opening moves as likely and odd ones as rare', async () => {
    expect(await service.status()).toEqual({ available: true, name: 'Maia-3' })
    const [e4, d4, h4] = await service.moveProbabilities(
      ['e2e4', 'd2d4', 'h2h4'].map((move) => ({ fen: START, move, eloSelf: 1500, eloOppo: 1500 })),
    )
    expect(e4).toBeGreaterThan(0.3)
    expect(d4).toBeGreaterThan(0.1)
    expect(h4).toBeLessThan(0.02)
  })
})
