import { buildBookData, createOpeningBook, type GameReview } from '@pawnia/analysis'
import { buildProfile } from '@pawnia/library'
import { describe, expect, it } from 'vitest'
import { sampleSummary } from '../testing'
import {
  afterOpening,
  openingDetail,
  openingOverview,
  openingPath,
  practiceVerdict,
  theoryChoices,
  type OpeningGame,
} from './openings'
import { playerGames } from './playerGames'

/** A small book: the Vienna lines theory knows here. */
const book = createOpeningBook(
  buildBookData([
    { eco: 'C25', name: 'Vienna Game', pgn: '1. e4 e5 2. Nc3' },
    { eco: 'C26', name: 'Vienna Game: Stanley Variation', pgn: '1. e4 e5 2. Nc3 Nf6 3. Bc4' },
    { eco: 'C29', name: 'Vienna Game: Vienna Gambit', pgn: '1. e4 e5 2. Nc3 Nf6 3. f4' },
    {
      eco: 'C27',
      name: 'Vienna Game: Frankenstein-Dracula',
      pgn: '1. e4 e5 2. Nc3 Nf6 3. Bc4 Nxe4 4. Qh5',
    },
    { eco: 'C25', name: 'Vienna Game: Max Lange Defense', pgn: '1. e4 e5 2. Nc3 Nc6 3. Bc4 Nf6' },
  ]),
)

const profile = buildProfile(
  { accounts: [{ source: 'chesscom', username: 'me' }] },
  { id: 'p', now: '2026-11-10T00:00:00.000Z' },
)

let n = 0
function game(moves: string, result: '1-0' | '0-1' | '1/2-1/2', side: 'white' | 'black' = 'white') {
  n++
  const [played] = playerGames(
    [
      sampleSummary({
        id: `g${n}`,
        white: { name: side === 'white' ? 'me' : 'them' },
        black: { name: side === 'white' ? 'them' : 'me' },
        result,
        opening: { name: side === 'white' ? 'Vienna Game: Some Line' : 'Sicilian Defense' },
      }),
    ],
    profile,
  )
  const path = openingPath(`[Result "${result}"]\n\n${moves} ${result}`, book)
  return { ...played!, ...(path && { path }) } satisfies OpeningGame
}

describe('openingPath', () => {
  it('marks theory move by move and finds where the game left it, with what theory had', () => {
    const path = openingPath('1. e4 e5 2. Nc3 Nf6 3. d3 Bc5 *', book)!
    expect(path.moves.map((m) => [m.san, m.book])).toEqual([
      ['e4', true],
      ['e5', true],
      ['Nc3', true],
      ['Nf6', true],
      ['d3', false],
      ['Bc5', false],
    ])
    expect(path.moves[4]!.uci).toBe('d2d3')
    expect(path.departure).toEqual({ ply: 5, san: 'd3', theory: ['Bc4', 'f4'] })
  })

  it('has no departure for a game that stays in theory, and nothing for an unreadable PGN', () => {
    expect(openingPath('1. e4 e5 2. Nc3 *', book)?.departure).toBeUndefined()
    // The book ends after 4.Qh5: 4...Nd6 leaves nothing theory knows.
    expect(
      openingPath('1. e4 e5 2. Nc3 Nf6 3. Bc4 Nxe4 4. Qh5 Nd6 *', book)?.departure,
    ).toBeUndefined()
    expect(openingPath('1. e4 e5 2. Ke3', book)).toBeUndefined()
  })
})

describe('openings', () => {
  const games = [
    game('1. e4 e5 2. Nc3 Nf6 3. Bc4 Nxe4 4. Qh5 Nd6', '1-0'), // the book ends at 4.Qh5
    game('1. e4 e5 2. Nc3 Nf6 3. d3 Bc5', '0-1'), // you leave at 3.d3
    game('1. e4 e5 2. Nc3 Nf6 3. d3 d5', '0-1'), // you leave at 3.d3
    game('1. e4 e5 2. Nc3 Nc6 3. Bc4 Bc5', '0-1'), // they leave at 3...Bc5
    game('1. e4 c5 2. Nf3', '1-0', 'black'),
    game('1. e4 c5 2. Nc3', '1-0', 'black'),
  ]

  it('lists openings per colour, worst first, with where theory was left', () => {
    expect(openingOverview(games)).toEqual([
      {
        color: 'white',
        family: 'Vienna Game',
        tally: expect.objectContaining({ games: 4, wins: 1, losses: 3, score: 25 }),
        departures: { you: 2, them: 1, none: 1, youAt: 3 },
      },
      {
        color: 'black',
        family: 'Sicilian Defense',
        tally: expect.objectContaining({ games: 2, losses: 2 }),
        // The small book here has no Sicilian: 1...c5 already leaves it.
        departures: { you: 2, them: 0, none: 0, youAt: 1 },
      },
    ])
  })

  it('shows the lines of one opening, with theory marks and what theory had instead', () => {
    const detail = openingDetail(games, 'white', 'Vienna Game')!
    const line = (moves: string) => detail.lines.find((l) => l.moves.join(' ') === moves)
    expect(line('e4 e5 Nc3 Nf6 d3')).toEqual({
      moves: ['e4', 'e5', 'Nc3', 'Nf6', 'd3'],
      tally: expect.objectContaining({ games: 2, losses: 2 }),
      book: false,
      yours: true,
      theory: ['Bc4', 'f4'],
    })
    // One game where the opponent left theory: in the games, not a branch of its own.
    expect(line('e4 e5 Nc3 Nc6 Bc4 Bc5')).toBeUndefined()
    // A game that stayed in theory as far as the book goes shows only where others went too.
    expect(line('e4 e5 Nc3 Nf6 Bc4')).toBeUndefined()
    // After 3.d3 the two games split once each, past their departure: not shown.
    expect(line('e4 e5 Nc3 Nf6 d3 Bc5')).toBeUndefined()
    expect(detail.games.map((g) => g.left && [g.left.by, g.left.ply, g.left.san])).toEqual([
      undefined,
      ['you', 5, 'd3'],
      ['you', 5, 'd3'],
      ['them', 6, 'Bc5'],
    ])
    expect(openingDetail(games, 'black', 'Vienna Game')).toBeUndefined()
  })
})

describe('afterOpening', () => {
  const review = (whiteWinAt24: number, errorPlies: number[]): GameReview =>
    ({
      positions: Array.from({ length: 30 }, (_, i) => ({ whiteWin: i === 24 ? whiteWinAt24 : 50 })),
      moves: Array.from({ length: 30 }, (_, i) => ({
        ply: i + 1,
        color: i % 2 === 0 ? 'white' : 'black',
        classification: errorPlies.includes(i + 1) ? 'mistake' : 'good',
      })),
    }) as unknown as GameReview

  it('averages the winning chance after move 12 and the errors in the first ten moves', () => {
    expect(
      afterOpening([
        { side: 'white', review: review(40, [5, 9, 25]) }, // 25 is past move 10
        { side: 'black', review: review(30, [6]) }, // Black: 100 - 30
      ]),
    ).toEqual({ reviewedGames: 2, win: 55, errorsPerGame: 1.5 })
    expect(afterOpening([])).toEqual({ reviewedGames: 0, errorsPerGame: 0 })
  })
})

describe('practice', () => {
  it('lists theory’s moves from a position with their UCI', () => {
    const afterNf6 = 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3'
    expect(theoryChoices(afterNf6, book)).toEqual([
      { san: 'Bc4', uci: 'f1c4' },
      { san: 'f4', uci: 'f2f4' },
    ])
  })

  it('counts a move off theory by its review', () => {
    expect(practiceVerdict('best')).toBe('good')
    expect(practiceVerdict('excellent')).toBe('good')
    expect(practiceVerdict('good')).toBe('playable')
    expect(practiceVerdict('inaccuracy')).toBe('wrong')
  })
})
