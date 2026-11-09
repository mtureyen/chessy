import type { PositionEval } from '@pawnia/analysis'
import { describe, expect, it } from 'vitest'
import type { EngineService, EngineStatus } from '../../engine/service'
import { evaluatePositionTool } from './evaluatePosition'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function fakeEngine(
  evaluation: PositionEval,
  status: EngineStatus = { available: true, name: 'Fake', parallelism: 1 },
) {
  const requests: unknown[] = []
  const engine: EngineService = {
    status: async () => status,
    async evaluate(request) {
      requests.push(request)
      return [evaluation]
    },
  }
  return { engine, requests }
}

describe('evaluate_position', () => {
  it('gives the engine’s lines in SAN with readable evaluations', async () => {
    const { engine, requests } = fakeEngine({
      depth: 24,
      lines: [
        { rank: 1, depth: 24, score: { type: 'cp', value: 32 }, pv: ['e2e4', 'e7e5', 'g1f3'] },
        {
          rank: 2,
          depth: 24,
          score: { type: 'mate', winner: 'black', moves: 3 },
          pv: ['f2f3', 'e7e5'],
        },
      ],
    })
    const tool = evaluatePositionTool(engine)
    const input = tool.parse({ fen: START, lines: 2 })
    expect(input.ok).toBe(true)
    const output = await tool.run((input as { value: unknown }).value, {})
    expect(JSON.parse(output.content)).toEqual({
      sideToMove: 'white',
      depth: 24,
      lines: [
        { evaluation: '+0.32', moves: 'e4 e5 Nf3' },
        { evaluation: 'Black mates in 3', moves: 'f3 e5' },
      ],
    })
    expect(requests[0]).toMatchObject({ fens: [START], multiPv: 2 })
  })

  it('fails with a message the model can use', async () => {
    const tool = evaluatePositionTool(fakeEngine({ depth: 0, lines: [] }).engine)
    await expect(tool.run({ fen: 'not a fen' }, {})).rejects.toThrow()
    const offline = evaluatePositionTool(
      fakeEngine({ depth: 0, lines: [] }, { available: false, reason: 'no binary' }).engine,
    )
    await expect(offline.run({ fen: START }, {})).rejects.toThrow(/no engine on this server/)
    expect(tool.parse({ fen: START, lines: 9 }).ok).toBe(false)
  })
})
