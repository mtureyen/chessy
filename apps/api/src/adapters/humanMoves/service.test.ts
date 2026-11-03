import { MOVE_COUNT, moveIndex, type MaiaModel } from '@chessy/maia'
import { describe, expect, it } from 'vitest'
import { MaiaHumanMoveService } from './service'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** A model that strongly prefers e2e4, and counts its loads and runs. */
function fakeModel() {
  const counts = { runs: 0, running: 0, overlapping: false }
  const model: MaiaModel = {
    async run(inputs) {
      counts.runs++
      counts.running++
      if (counts.running > 1) counts.overlapping = true
      await new Promise((resolve) => setTimeout(resolve, 5))
      counts.running--
      return inputs.map(() => {
        const logits = new Float32Array(MOVE_COUNT)
        logits[moveIndex('e2e4')!] = 10
        return { logits, value: new Float32Array(3) }
      })
    },
  }
  return { model, counts }
}

describe('MaiaHumanMoveService', () => {
  it('loads once, answers per query and runs one batch at a time', async () => {
    const { model, counts } = fakeModel()
    let loads = 0
    const service = new MaiaHumanMoveService(async () => {
      loads++
      return model
    })
    const query = (move: string) => [{ fen: START, move, eloSelf: 1500, eloOppo: 1500 }]
    const [likely, rare] = await Promise.all([
      service.moveProbabilities(query('e2e4')),
      service.moveProbabilities(query('a2a3')),
    ])
    expect(likely![0]).toBeGreaterThan(0.99)
    expect(rare![0]).toBeLessThan(0.01)
    expect(await service.status()).toEqual({ available: true, name: 'Maia-3' })
    expect(loads).toBe(1)
    expect(counts).toMatchObject({ runs: 2, overlapping: false })
  })

  it('reports a failed load as unavailable and tries again later', async () => {
    const { model } = fakeModel()
    let missing = true
    const service = new MaiaHumanMoveService(async () => {
      if (missing) throw new Error('No Maia model')
      return model
    })
    expect(await service.status()).toEqual({ available: false, reason: 'No Maia model' })
    missing = false
    expect(await service.status()).toMatchObject({ available: true })
  })
})
