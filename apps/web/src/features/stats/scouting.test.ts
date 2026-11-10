import type { PlayerStatsBody } from '@pawnia/contracts'
import { describe, expect, it } from 'vitest'
import { scouting } from './scouting'

const t = (wins: number, draws: number, losses: number) => {
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

/** knightowl88's last 100 games, as in the page's mock-up. */
function stats(overrides: Partial<PlayerStatsBody> = {}): PlayerStatsBody {
  return {
    player: {
      kind: 'lookup',
      profile: {
        source: 'chesscom',
        username: 'knightowl88',
        url: 'https://www.chess.com/member/knightowl88',
        ratings: {},
      },
    },
    window: { last: 100, found: 100 },
    record: t(52, 7, 41),
    ratings: [],
    openings: {
      white: [
        { family: 'Italian Game', tally: t(12, 3, 6), variations: [] },
        { family: 'Scotch Game', tally: t(10, 2, 10), variations: [] },
        { family: 'Ruy Lopez', tally: t(1, 1, 3), variations: [] },
      ],
      black: [{ family: 'Sicilian Defense', tally: t(11, 1, 12), variations: [] }],
    },
    repertoire: {
      white: [
        { moves: ['e4'], tally: t(25, 4, 15) },
        { moves: ['e4', 'e5'], tally: t(14, 3, 8) },
      ],
      black: [
        { moves: ['e4'], tally: t(14, 2, 15) },
        { moves: ['e4', 'c5'], tally: t(11, 1, 12), opening: 'Sicilian Defense' },
        { moves: ['d4'], tally: t(9, 1, 6) },
        { moves: ['d4', 'Nf6'], tally: t(7, 0, 5), opening: "King's Indian Defense" },
      ],
    },
    endings: {
      wins: [],
      draws: [],
      losses: [
        { reason: 'time', games: 19 },
        { reason: 'resignation', games: 12 },
        { reason: 'checkmate', games: 10 },
      ],
    },
    opponents: [],
    activity: {
      timeZone: 'Europe/Berlin',
      dayParts: [
        { key: 'evening', tally: t(32, 4, 19) },
        { key: 'night', tally: t(4, 2, 8) },
      ],
      weekdays: [],
    },
    games: [],
    ...overrides,
  }
}

describe('scouting', () => {
  it('says what they play, where they are weak and how they lose', () => {
    expect(scouting(stats())).toEqual([
      'As White almost always 1.e4 (92% of 48 games, scoring 61%); most common in their White games: Italian Game (21 games, 64%).',
      'Against 1.e4 they answer 1…c5 (Sicilian Defense) in 24 of 31 games, scoring 48%.',
      "Against 1.d4 they answer 1…Nf6 (King's Indian Defense) in 12 of 16 games, scoring 58%.",
      'Scores badly in Ruy Lopez games with White: 30% in 5.',
      '46% of their losses are on time (19 of 41): keep the game long and the clock busy.',
      'Weaker at night: 36% against 56% overall (14 games, Europe/Berlin time).',
    ])
  })

  it('stays quiet when nothing stands out', () => {
    const quiet = stats({
      openings: { white: [], black: [] },
      repertoire: { white: [], black: [] },
      endings: { wins: [], draws: [], losses: [{ reason: 'time', games: 2 }] },
      activity: { timeZone: 'UTC', dayParts: [], weekdays: [] },
    })
    expect(scouting(quiet)).toEqual([])
  })
})
