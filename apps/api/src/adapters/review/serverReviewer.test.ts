import { fileURLToPath } from 'node:url'
import type { EvaluationRequest, PositionEval } from '@chessy/analysis'
import { createGame } from '@chessy/chess'
import { describe, expect, it } from 'vitest'
import type { EngineService } from '../engine/service'
import type { HumanMoveService } from '../humanMoves/service'
import { createServerReviewer, SERVER_REVIEW_NODES } from './serverReviewer'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const BOOK = fileURLToPath(new URL('../../../../web/public/openings/book.json', import.meta.url))

/** An engine that finds every position equal, its first legal move best. */
function fakeEngine() {
  const requests: EvaluationRequest[] = []
  const engine: EngineService = {
    status: async () => ({ available: true, name: 'Stockfish (fake)', parallelism: 2 }),
    evaluate: async (request) => {
      requests.push(request)
      return request.fens.map((fen): PositionEval => {
        const move = createGame(fen).legalMoves()[0]
        return {
          depth: 18,
          lines: move
            ? [{ rank: 1, depth: 18, score: { type: 'cp', value: 0 }, pv: [move.from + move.to] }]
            : [],
        }
      })
    },
  }
  return { engine, requests }
}

const maia = (available: boolean): HumanMoveService => ({
  status: async () =>
    available ? { available: true, name: 'Maia-3' } : { available: false, reason: 'no model' },
  moveProbabilities: async (queries) => queries.map(() => 0.5),
  predict: async () => ({ moves: [], expectedScore: 0.5 }),
})

const input = { startFen: START, moves: ['e2e4', 'e7e5', 'g1f3'] }

describe('createServerReviewer', () => {
  it("reviews like the app's Standard review, with the opening book and Maia", async () => {
    const { engine, requests } = fakeEngine()
    const review = await createServerReviewer({ engine, humanMoves: maia(true), bookPath: BOOK })(
      input,
    )
    expect(review.moves.map((m) => m.classification)).toEqual(['book', 'book', 'book'])
    expect(review.settings).toEqual({
      engine: 'Stockfish (fake)',
      nodes: SERVER_REVIEW_NODES,
      humanMoves: 'Maia-3',
    })
    expect(requests.every((r) => r.nodes === SERVER_REVIEW_NODES)).toBe(true)
  })

  it('reviews without Maia or the book when the server lacks them', async () => {
    const review = await createServerReviewer({
      engine: fakeEngine().engine,
      humanMoves: maia(false),
      bookPath: '/nowhere/book.json',
    })(input)
    expect(review.settings.humanMoves).toBeUndefined()
    expect(review.moves.some((m) => m.classification === 'book')).toBe(false)
  })

  it('reviews a line once when it is asked for twice at the same time', async () => {
    const { engine, requests } = fakeEngine()
    const reviewer = createServerReviewer({ engine, humanMoves: maia(false), bookPath: BOOK })
    const [a, b] = await Promise.all([reviewer(input), reviewer({ ...input })])
    expect(a).toBe(b)
    const evaluated = requests.length
    await reviewer(input) // after it finished, a new request reviews again
    expect(requests.length).toBeGreaterThan(evaluated)
  })

  it('fails with the reason when the server has no engine', async () => {
    const engine: EngineService = {
      status: async () => ({ available: false, reason: 'no binary' }),
      evaluate: async () => [],
    }
    await expect(
      createServerReviewer({ engine, humanMoves: maia(false), bookPath: BOOK })(input),
    ).rejects.toThrow(/no binary/)
  })
})
