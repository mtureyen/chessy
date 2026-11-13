import type { PlayerStatsBody } from '@pawnia/contracts'
import { describe, expect, it } from 'vitest'
import { summaryFacts } from './playerSummaries'

const tally = (wins: number, draws: number, losses: number) => {
  const games = wins + draws + losses
  return {
    games,
    wins,
    draws,
    losses,
    unfinished: 0,
    score: Math.round(((wins + draws / 2) / games) * 100),
  }
}

const errors = (blunder: number) => ({ inaccuracy: 4, mistake: 2, miss: 0, blunder })

/** The user's last 20 games, with four of them reviewed. */
const own: PlayerStatsBody = {
  player: { kind: 'me', displayName: 'Sly', accounts: [{ source: 'chesscom', username: 'sly' }] },
  window: { last: 30, speed: 'rapid', found: 20 },
  record: tally(9, 2, 9),
  ratings: [
    {
      category: 'chesscom',
      speed: 'rapid',
      points: [
        { at: '2026-10-01T18:00:00.000Z', rating: 790 },
        { at: '2026-10-20T18:00:00.000Z', rating: 760 },
        { at: '2026-11-10T18:00:00.000Z', rating: 812 },
      ],
    },
    { category: 'lichess', speed: 'rapid', points: [] },
  ],
  openings: {
    white: [
      { family: 'Italian Game', tally: tally(4, 0, 2), variations: [] },
      { family: 'Unknown opening', tally: tally(2, 1, 1), variations: [] },
      { family: 'Bishop’s Opening', tally: tally(1, 0, 1), variations: [] },
    ],
    black: [{ family: 'Sicilian Defense', tally: tally(1, 1, 4), variations: [] }],
  },
  repertoire: {
    white: [
      { moves: ['e4'], tally: tally(7, 1, 4), opening: 'King’s Pawn Game' },
      { moves: ['e4', 'e5'], tally: tally(5, 0, 3) },
      { moves: ['d4'], tally: tally(0, 0, 2) },
    ],
    black: [
      { moves: ['e4'], tally: tally(1, 1, 5) },
      { moves: ['e4', 'e5'], tally: tally(0, 0, 1), opening: 'Open Game' },
      { moves: ['e4', 'c5'], tally: tally(1, 1, 4), opening: 'Sicilian Defense' },
      { moves: ['d4'], tally: tally(0, 0, 1) },
    ],
  },
  endings: {
    wins: [{ reason: 'resignation', games: 9 }],
    draws: [{ reason: 'agreement', games: 2 }],
    losses: [
      { reason: 'checkmate', games: 6 },
      { reason: 'time', games: 3 },
    ],
    averageMoves: 33,
  },
  opponents: [
    { key: 'stronger (+100 or more)', tally: tally(1, 0, 5) },
    { key: 'similar (within 100)', tally: tally(8, 2, 4) },
  ],
  activity: {
    timeZone: 'Europe/Berlin',
    dayParts: [
      { key: 'night', tally: { games: 0, wins: 0, draws: 0, losses: 0, unfinished: 0 } },
      { key: 'evening', tally: tally(5, 1, 7) },
    ],
    weekdays: [{ key: 'sat', tally: tally(9, 2, 9) }],
  },
  quality: {
    reviewedGames: 4,
    averageAccuracy: 68,
    phases: {
      opening: { moves: 40, errors: errors(1) },
      middlegame: { moves: 60, errors: errors(6) },
      endgame: { moves: 20, errors: errors(2) },
    },
    errorsPerGame: { inaccuracy: 3, mistake: 1.5, miss: 0, blunder: 2.3 },
    accuracy: [{ at: '2026-11-10T18:00:00.000Z', accuracy: 68 }],
  },
  games: [],
}

describe('summaryFacts', () => {
  it('cuts the user’s numbers down to what can be quoted', () => {
    const facts = summaryFacts(own)
    expect(facts).toMatchObject({
      kind: 'own',
      name: 'Sly',
      window: { games: 20, speed: 'rapid' },
      record: { games: 20, wins: 9, draws: 2, losses: 9, score: 50 },
      // From the first game to the last; series without games are left out.
      ratings: [{ series: 'chess.com rapid', start: 790, end: 812, games: 3 }],
      // Families with enough games, not the unknown ones.
      openings: {
        white: [{ name: 'Italian Game', games: 6, score: 67 }],
        black: [{ name: 'Sicilian Defense', games: 6 }],
      },
      firstMoves: {
        asWhite: [
          { move: '1.e4', share: 86, games: 12 },
          { move: '1.d4', share: 14, games: 2 },
        ],
        // The most played answer, not the first listed.
        asBlack: [
          { against: '1.e4', reply: '1...c5', opening: 'Sicilian Defense', games: 6, of: 7 },
        ],
      },
      endings: {
        wins: [{ how: 'resignation', games: 9 }],
        losses: [
          { how: 'checkmate', games: 6 },
          { how: 'on time', games: 3 },
        ],
        averageMoves: 33,
      },
      opponents: [{ group: 'stronger (+100 or more)', games: 6, score: 17 }, {}],
      timeOfDay: { timeZone: 'Europe/Berlin', parts: [{ part: 'evening (18-24)', games: 13 }] },
      moveQuality: {
        reviewedGames: 4,
        averageAccuracy: 68,
        perGame: { blunders: 2.3, mistakes: 1.5, misses: 0, inaccuracies: 3 },
        phases: {
          opening: { moves: 40, blunders: 0.3, mistakes: 0.5, inaccuracies: 1 },
          middlegame: { moves: 60, blunders: 1.5 },
          endgame: { moves: 20, blunders: 0.5 },
        },
      },
    })
    expect(facts.record).not.toHaveProperty('unfinished')
    // Numbers to quote, never the games themselves.
    expect(JSON.stringify(facts)).not.toContain('games":[')
  })

  it('without reviewed games, says nothing of move quality', () => {
    const { quality: _, ...unreviewed } = own
    expect(summaryFacts(unreviewed)).not.toHaveProperty('moveQuality')
  })

  it('never carries move quality for a looked-up player, even when the numbers had some', () => {
    const lookup: PlayerStatsBody = {
      ...own,
      player: {
        kind: 'lookup',
        profile: {
          source: 'chesscom',
          username: 'knightowl88',
          url: 'https://www.chess.com/member/knightowl88',
          ratings: { rapid: 1642 },
        },
      },
      window: { ...own.window, since: '2025-11-14T00:00:00.000Z', more: false },
    }
    const facts = summaryFacts(lookup)
    expect(facts).toMatchObject({
      kind: 'opponent',
      name: 'knightowl88',
      platform: 'chess.com',
      window: { games: 20, since: '2025-11-14' },
    })
    expect(facts).not.toHaveProperty('moveQuality')
    expect(JSON.stringify(facts)).not.toMatch(/accuracy|blunder|mistake|inaccurac|reviewed/i)
  })
})
