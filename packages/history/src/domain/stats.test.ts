import { buildProfile } from '@chessy/library'
import { describe, expect, it } from 'vitest'
import { sampleSummary as summary } from '../testing'
import { playerGames } from './playerGames'
import { groupGames, moveQuality, openingFamily, phaseOf, ratingTrends, tally } from './stats'

const profile = buildProfile(
  { accounts: [{ source: 'chesscom', username: '8sly' }] },
  { id: 'p', now: '2026-11-05T00:00:00.000Z' },
)
const me = (name: string, rating?: number) => ({ name, ...(rating && { rating }) })

const games = playerGames(
  [
    summary({
      id: 'a',
      playedAt: '2026-09-01T10:00:00.000Z',
      white: me('8sly', 700),
      black: me('rival', 720),
      result: '1-0',
    }),
    summary({
      id: 'b',
      playedAt: '2026-09-20T10:00:00.000Z',
      white: me('8sly', 760),
      black: me('strong', 1000),
      result: '0-1',
      reviewed: true,
      accuracy: { white: 70, black: 85 },
    }),
    summary({
      id: 'c',
      playedAt: '2026-10-02T10:00:00.000Z',
      white: me('weak', 600),
      black: me('8sly', 740),
      result: '1/2-1/2',
      opening: { eco: 'B20', name: 'Sicilian Defense Alapin Variation' },
      reviewed: true,
      accuracy: { white: 50, black: 80 },
    }),
    summary({ id: 'd', source: 'chessy', white: me('You'), black: me('Bot'), result: '*' }),
  ],
  profile,
)

describe('tally', () => {
  it('scores finished games from the user’s side', () => {
    expect(tally(games)).toEqual({
      games: 4,
      wins: 1,
      draws: 1,
      losses: 1,
      unfinished: 1,
      score: 50,
    })
    expect(tally([])).toEqual({ games: 0, wins: 0, draws: 0, losses: 0, unfinished: 0 })
  })
})

describe('groupGames', () => {
  it('groups by opening family, most played first', () => {
    expect(groupGames(games, 'opening').map((g) => [g.key, g.tally.games])).toEqual([
      ['Italian Game', 3],
      ['Sicilian Defense', 1],
    ])
  })

  it('orders months in time and opponents by strength', () => {
    expect(groupGames(games, 'month').map((g) => g.key)).toEqual(['2026-09', '2026-10'])
    expect(groupGames(games, 'opponent_strength').map((g) => [g.key, g.tally.games])).toEqual([
      ['stronger (+100 or more)', 1],
      ['similar (within 100)', 1],
      ['weaker (-100 or more)', 1],
    ])
  })
})

describe('openingFamily', () => {
  it("cuts lichess names at the colon and chess.com's after the family word", () => {
    expect(openingFamily('Sicilian Defense: Alapin Variation')).toBe('Sicilian Defense')
    expect(openingFamily('Queens Pawn Opening Accelerated London System')).toBe(
      'Queens Pawn Opening',
    )
    expect(openingFamily('Kings Indian Attack Double Fianchetto')).toBe('Kings Indian Attack')
    expect(openingFamily('Ruy Lopez')).toBe('Ruy Lopez')
  })
})

describe('ratingTrends', () => {
  it('follows the rating per platform and speed', () => {
    expect(ratingTrends(games)).toEqual([
      {
        category: 'chesscom',
        speed: 'rapid',
        games: 3,
        first: { rating: 700, date: '2026-09-01' },
        last: { rating: 740, date: '2026-10-02' },
        highest: { rating: 760, date: '2026-09-20' },
        lowest: { rating: 700, date: '2026-09-01' },
      },
    ])
  })
})

describe('moveQuality', () => {
  it("counts the user's errors by phase in reviewed games only", () => {
    const quality = moveQuality(games, [
      { gameId: 'b', ply: 5, color: 'white', classification: 'mistake', pieces: 14 },
      { gameId: 'b', ply: 6, color: 'black', classification: 'blunder', pieces: 14 }, // opponent
      { gameId: 'b', ply: 41, color: 'white', classification: 'blunder', pieces: 10 },
      { gameId: 'c', ply: 60, color: 'black', classification: 'best', pieces: 4 },
      { gameId: 'a', ply: 7, color: 'white', classification: 'blunder', pieces: 14 }, // no review
    ])
    expect(quality.reviewedGames).toBe(2)
    expect(quality.averageAccuracy).toBe(75)
    expect(quality.phases.opening).toEqual({
      moves: 1,
      errors: { inaccuracy: 0, mistake: 1, miss: 0, blunder: 0 },
    })
    expect(quality.phases.middlegame.errors.blunder).toBe(1)
    expect(quality.phases.endgame.moves).toBe(1)
    expect(quality.errorsPerGame).toEqual({ inaccuracy: 0, mistake: 0.5, miss: 0, blunder: 0.5 })
  })

  it('tells the phase from the move number and the pieces left', () => {
    expect(phaseOf(10, 14)).toBe('opening')
    expect(phaseOf(30, 7)).toBe('middlegame')
    expect(phaseOf(12, 6)).toBe('endgame')
  })
})
