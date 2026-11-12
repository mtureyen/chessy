import type { GameReview, ReviewedMove } from '@pawnia/analysis'
import { createGame } from '@pawnia/chess'
import { buildProfile } from '@pawnia/library'
import { describe, expect, it } from 'vitest'
import { sampleReview, sampleSummary } from '../testing'
import { mistakeThemes, tallyThemes, type MistakeThemes } from './mistakeThemes'
import { playerGames } from './playerGames'

const profile = buildProfile(
  { accounts: [{ source: 'chesscom', username: '8sly' }] },
  { id: 'p', now: '2026-11-05T00:00:00.000Z' },
)
/** The user has White. */
const [game] = playerGames([sampleSummary({ id: 'g' })], profile)

/** A review of a line with its positions; `change` marks the moves the test is about. */
function reviewOf(
  startFen: string,
  moves: string,
  change: (moves: ReviewedMove[]) => void,
): GameReview {
  const uci = moves.split(' ')
  const board = createGame(startFen)
  const fens = [board.root.fen, ...uci.map((move) => board.play(move)!.fen)]
  const { review } = sampleReview({ startFen, moves: uci })
  change(review.moves)
  return {
    ...review,
    positions: fens.map((fen) => ({ fen, score: { type: 'cp' as const, value: 0 }, whiteWin: 50 })),
  }
}

function best(line: string): ReviewedMove['best'] {
  const moves = line.split(' ')
  return { uci: moves[0]!, san: moves[0]!, line: moves }
}

/** White: Rd1, Rh1 and king; Black: a knight on f6 and the king. White to move. */
const ROOKS = '4k3/8/5n2/8/8/8/8/3RK2R w - - 0 1'

describe('mistakeThemes', () => {
  it('finds the theme of a better move the user missed', () => {
    // 1. Rh2 Nd5 leaves the knight hanging; 2. Rh1 instead of 2. Rxd5.
    const review = reviewOf(ROOKS, 'h1h2 f6d5 h2h1 d5f6', (moves) => {
      moves[2]!.classification = 'miss'
      moves[2]!.best = best('d1d5 e8e7 d5d1')
    })
    expect(mistakeThemes(game!, review)).toEqual([
      { ply: 3, played: '2. h2h1', verdict: 'miss', missed: ['hangingPiece'], walkedInto: [] },
    ])
  })

  it('finds the theme of what the user’s move allowed', () => {
    // 1. Rd5 puts the rook where the knight takes it.
    const review = reviewOf(ROOKS, 'd1d5 f6d5 h1h2', (moves) => {
      moves[0]!.classification = 'blunder'
      moves[1]!.best = best('f6d5 h1h2 e8e7')
    })
    expect(mistakeThemes(game!, review)).toEqual([
      { ply: 1, played: '1. d1d5', verdict: 'blunder', missed: [], walkedInto: ['hangingPiece'] },
    ])
  })

  it('reads the opponent’s reply from the engine, not from the game', () => {
    // Black didn't take the rook in the game; the engine's line for Black does.
    const review = reviewOf(ROOKS, 'd1d5 e8e7 d5d1', (moves) => {
      moves[0]!.classification = 'blunder'
      moves[1]!.best = best('f6d5 h1h2 e8e7')
    })
    expect(mistakeThemes(game!, review)[0]!.walkedInto).toEqual(['hangingPiece'])
  })

  it('can find both for one move', () => {
    // 2. Rd4 misses the knight on d5; the line for Black then forks king and rook from c2.
    const review = reviewOf(ROOKS, 'h1h2 f6d5 d1d4 d5e3', (moves) => {
      moves[2]!.classification = 'mistake'
      moves[2]!.best = best('d1d5 e8e7 d5d1')
      moves[3]!.best = best('d5e3 h2h1 e3c2 e1d2 c2d4 d2d3 d4e6')
    })
    const [mistake] = mistakeThemes(game!, review)
    expect(mistake!.missed).toEqual(['hangingPiece'])
    expect(mistake!.walkedInto).toEqual(['fork'])
  })

  it('lists a mistake without a tactic behind it, with no themes', () => {
    const review = reviewOf(ROOKS, 'h1h2 f6g4 h2h1 g4f6', (moves) => {
      moves[2]!.classification = 'mistake'
      moves[2]!.best = best('d1d4 g4f6 d4d1')
      moves[3]!.best = best('g4f6 d1d2 e8e7')
    })
    expect(mistakeThemes(game!, review)).toEqual([
      { ply: 3, played: '2. h2h1', verdict: 'mistake', missed: [], walkedInto: [] },
    ])
  })

  it('leaves out the opponent’s mistakes and the user’s other moves', () => {
    const review = reviewOf(ROOKS, 'd1d5 e8e7 d5d1', (moves) => {
      moves[0]!.classification = 'inaccuracy'
      moves[1]!.classification = 'blunder'
      moves[1]!.best = best('f6d5 h1h2 e8e7')
    })
    expect(mistakeThemes(game!, review)).toEqual([])
  })

  it('has nothing missed on the first move and nothing walked into on the last', () => {
    const review = reviewOf(ROOKS, 'h1h2 f6d5 h2h1', (moves) => {
      // No move of the opponent's came before the first one, and none follows the last.
      moves[0]!.classification = 'mistake'
      moves[0]!.best = best('d1d6 f6d5 d6d5')
      moves[2]!.classification = 'miss'
      moves[2]!.best = best('d1d5 e8e7 d5d1')
    })
    const found = mistakeThemes(game!, review)
    expect(found.map(({ ply, missed, walkedInto }) => ({ ply, missed, walkedInto }))).toEqual([
      { ply: 1, missed: [], walkedInto: [] },
      { ply: 3, missed: ['hangingPiece'], walkedInto: [] },
    ])
  })

  it('takes the user’s side from the game', () => {
    const [asBlack] = playerGames(
      [
        sampleSummary({
          id: 'b',
          white: { name: 'rival', rating: 820 },
          black: { name: '8sly', rating: 790 },
        }),
      ],
      profile,
    )
    const review = reviewOf(ROOKS, 'd1d5 e8e7 d5d1', (moves) => {
      moves[0]!.classification = 'blunder'
      // Black's 1... Ke7 misses the rook on d5.
      moves[1]!.classification = 'miss'
      moves[1]!.best = best('f6d5 h1h2 e8e7')
    })
    expect(mistakeThemes(asBlack!, review)).toEqual([
      { ply: 2, played: '1... e8e7', verdict: 'miss', missed: ['hangingPiece'], walkedInto: [] },
    ])
  })
})

describe('tallyThemes', () => {
  const mistake = (ply: number, missed: string[], walkedInto: string[]) =>
    ({ ply, played: '', verdict: 'mistake', missed, walkedInto }) as MistakeThemes

  it('counts per theme how often it was missed and walked into, with where', () => {
    const tally = tallyThemes([
      { gameId: 'a', mistakes: [mistake(12, ['fork'], ['pin']), mistake(30, [], ['fork', 'pin'])] },
      { gameId: 'b', mistakes: [mistake(7, [], ['pin'])] },
    ])
    expect(tally).toEqual([
      {
        theme: 'pin',
        missed: [],
        walkedInto: [
          { gameId: 'a', ply: 12 },
          { gameId: 'a', ply: 30 },
          { gameId: 'b', ply: 7 },
        ],
      },
      {
        theme: 'fork',
        missed: [{ gameId: 'a', ply: 12 }],
        walkedInto: [{ gameId: 'a', ply: 30 }],
      },
    ])
  })

  it('keeps themes with equal counts in the order they came up', () => {
    const tally = tallyThemes([{ gameId: 'a', mistakes: [mistake(3, ['skewer'], ['fork'])] }])
    expect(tally.map(({ theme }) => theme)).toEqual(['skewer', 'fork'])
  })

  it('is empty without themes', () => {
    expect(tallyThemes([])).toEqual([])
    expect(tallyThemes([{ gameId: 'a', mistakes: [mistake(3, [], [])] }])).toEqual([])
  })
})
