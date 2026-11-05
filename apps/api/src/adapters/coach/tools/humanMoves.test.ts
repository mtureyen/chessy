import type { HumanMoveRequest } from '@chessy/maia'
import { describe, expect, it } from 'vitest'
import type { HumanMoveService } from '../../humanMoves/service'
import { humanMovesTool } from './humanMoves'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function fakeMaia(available = true) {
  const requests: HumanMoveRequest[] = []
  const service: HumanMoveService = {
    status: async () =>
      available ? { available: true, name: 'Maia-3' } : { available: false, reason: 'no model' },
    moveProbabilities: async () => [],
    predict: async (request) => {
      requests.push(request)
      return {
        moves: [
          { move: 'e2e4', probability: 0.412 },
          { move: 'd2d4', probability: 0.3 },
          { move: 'g1f3', probability: 0.1 },
        ],
        expectedScore: 0.534,
      }
    },
  }
  return { service, requests }
}

describe('human_moves', () => {
  it("lists the likeliest moves in SAN for the user's rating", async () => {
    const { service, requests } = fakeMaia()
    const tool = humanMovesTool(service)
    const input = tool.parse({ fen: START, moves: 2 })
    const output = await tool.run((input as { value: unknown }).value, { rating: 800 })
    expect(requests).toEqual([{ fen: START, eloSelf: 800 }])
    expect(JSON.parse(output.content)).toEqual({
      rating: 800,
      moves: [
        { move: 'e4', probability: '41%' },
        { move: 'd4', probability: '30%' },
      ],
      expectedScore:
        '53% for the side to move (how such games tend to end from here, not an engine evaluation)',
    })
  })

  it('says so when it has to guess the rating, and fails without a model', async () => {
    const tool = humanMovesTool(fakeMaia().service)
    const output = await tool.run({ fen: START, moves: 1 }, {})
    expect(JSON.parse(output.content)).toMatchObject({ rating: 1500, note: expect.any(String) })
    const offline = humanMovesTool(fakeMaia(false).service)
    await expect(offline.run({ fen: START, moves: 1 }, {})).rejects.toThrow(/no model/)
    await expect(tool.run({ fen: 'x', moves: 1 }, {})).rejects.toThrow()
  })
})
