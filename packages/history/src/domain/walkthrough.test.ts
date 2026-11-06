import type { GameReview, ReviewedMove } from '@chessy/analysis'
import { createGame } from '@chessy/chess'
import { describe, expect, it } from 'vitest'
import { sampleReview } from '../testing'
import { lastBookPly, momentFacts, phaseAccuracy, walkthroughMoves } from './walkthrough'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** A real game: 1. e4 e5 2. Qh5 Nc6 3. Qxf7+ Kxf7, with the moves as `change` makes them. */
function review(change: (moves: ReviewedMove[]) => void = () => {}): GameReview {
  const uci = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5f7', 'e8f7']
  const game = createGame()
  const fens = [game.root.fen, ...uci.map((move) => game.play(move)!.fen)]
  const { review } = sampleReview({ startFen: START, moves: uci })
  review.moves.forEach((move, i) => {
    move.san = ['e4', 'e5', 'Qh5', 'Nc6', 'Qxf7+', 'Kxf7'][i]!
  })
  change(review.moves)
  return {
    ...review,
    positions: fens.map((fen) => ({ fen, score: { type: 'cp', value: 0 }, whiteWin: 50 })),
  }
}

const blunder = (move: ReviewedMove, swing = 40) => {
  move.classification = 'blunder'
  move.winBefore = 60
  move.winAfter = 60 - swing
}

describe('walkthroughMoves', () => {
  it("takes the side's key moments in game order, or both sides' without a side", () => {
    const game = review((moves) => {
      blunder(moves[2]!)
      blunder(moves[3]!)
      blunder(moves[4]!)
    })
    expect(walkthroughMoves(game, 'white').map((m) => m.ply)).toEqual([3, 5])
    expect(walkthroughMoves(game, undefined).map((m) => m.ply)).toEqual([3, 4, 5])
  })

  it('keeps great moves and the biggest swings when there are too many', () => {
    const game = review((moves) => {
      blunder(moves[0]!, 10)
      blunder(moves[2]!, 50)
      moves[4]!.classification = 'great'
    })
    expect(walkthroughMoves(game, 'white', 2).map((m) => m.ply)).toEqual([3, 5])
  })
})

describe('momentFacts', () => {
  it('says what happened, the better move, the best reply and what hangs', () => {
    const game = review((moves) => {
      blunder(moves[4]!)
      moves[4]!.facts.humanProbability = 0.123
      moves[4]!.best = { uci: 'f1c4', san: 'Bc4', line: ['f1c4', 'g8f6'] }
      moves[5]!.best = { uci: 'e8f7', san: 'Kxf7', line: ['e8f7'] }
    })
    expect(momentFacts(game, game.moves[4]!)).toEqual({
      ply: 5,
      move: '3. Qxf7+',
      color: 'white',
      verdict: 'blunder',
      winBefore: 60,
      winAfter: 20,
      better: { move: 'Bc4', line: '3. Bc4 Nf6' },
      reply: '3... Kxf7',
      hanging: { piece: 'queen', square: 'f7', pawns: 9 },
      playedBy: 12,
    })
  })

  it('leaves out what the review does not know', () => {
    const game = review()
    expect(momentFacts(game, game.moves[0]!)).toEqual({
      ply: 1,
      move: '1. e4',
      color: 'white',
      verdict: 'best',
      winBefore: 50,
      winAfter: 50,
    })
  })
})

describe('game shape', () => {
  it('finds the last book move and the accuracy per phase', () => {
    const game = review((moves) => {
      moves[0]!.classification = 'book'
      moves[1]!.classification = 'book'
      moves[2]!.accuracy = 40
    })
    expect(lastBookPly(game)).toBe(2)
    expect(lastBookPly(review())).toBeUndefined()
    expect(phaseAccuracy(game, 'white')).toEqual({ opening: 80 })
  })
})
