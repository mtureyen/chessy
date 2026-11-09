import { reviewGame, type PositionEvaluator, type Score } from '@pawnia/analysis'
import { createGame, type MoveNode } from '@pawnia/chess'
import { describe, expect, it } from 'vitest'
import { commentFacts, judgedMoves } from './moveComment'

/** Plays the moves; each node of the game, in order. */
function played(moves: string[]): MoveNode[] {
  const game = createGame()
  return moves.map((move) => game.play(move)!)
}

/** An engine that scores each position from `scores` (White's view) and has its own favourites. */
function engine(scores: Record<string, Score>): PositionEvaluator {
  return {
    describe: async () => ({ name: 'Scripted', parallelism: 1 }),
    evaluate: async ({ fens }) =>
      fens.map((fen) => ({
        depth: 12,
        lines: [
          {
            rank: 1,
            depth: 12,
            score: scores[fen] ?? { type: 'cp', value: 0 },
            pv: ['d2d4', 'g8f6'],
          },
        ],
      })),
  }
}

const judge = (node: MoveNode, scores: Record<string, Score>, rating?: number) =>
  reviewGame({ evaluator: engine(scores) }, judgedMoves(node), { nodes: 1000 }).then((review) =>
    commentFacts(node, review, rating),
  )

describe('judgedMoves', () => {
  it('takes the move and the opponent move before it', () => {
    const [, e5, nf3] = played(['e4', 'e5', 'Nf3'])
    expect(judgedMoves(nf3!)).toEqual({ startFen: e5!.parent!.fen, moves: ['e7e5', 'g1f3'] })
  })

  it('has only the move itself at the start of the game', () => {
    const [e4] = played(['e4'])
    expect(judgedMoves(e4!)).toEqual({ startFen: e4!.parent!.fen, moves: ['e2e4'] })
  })

  it('as Black, the first move goes with the opening move', () => {
    const [e4, e5] = played(['e4', 'e5'])
    expect(judgedMoves(e5!)).toEqual({ startFen: e4!.parent!.fen, moves: ['e2e4', 'e7e5'] })
  })
})

describe('commentFacts', () => {
  it('gives the facts of a blunder and nothing of what the engine wanted', async () => {
    const nodes = played(['f3', 'e5', 'g4'])
    const g4 = nodes[2]!
    const facts = await judge(g4, { [g4.fen]: { type: 'mate', winner: 'black', moves: 1 } }, 1200)
    expect(facts).toEqual({
      fen: g4.fen,
      color: 'white',
      moveNumber: 2,
      san: 'g4',
      verdict: 'blunder',
      winBefore: 50,
      winAfter: expect.any(Number),
      mateIn: 1,
      rating: 1200,
    })
    expect(JSON.stringify(facts)).not.toMatch(/d2d4|g8f6|d4|Nf6/)
  })

  it('names the piece left for the taking', async () => {
    const nodes = played(['e4', 'e5', 'Nf3', 'Nc6', 'Ng5', 'Qxg5'])
    const ng5 = nodes[4]!
    const facts = await judge(ng5, { [ng5.fen]: { type: 'cp', value: -400 } })
    expect(facts).toMatchObject({
      verdict: 'blunder',
      hanging: { piece: 'knight', square: 'g5', pawns: 3 },
    })
    expect(facts).not.toHaveProperty('rating')
  })

  it('has nothing to say about a quiet move', async () => {
    const [e4] = played(['e4'])
    expect(await judge(e4!, {})).toBeUndefined()
  })
})
