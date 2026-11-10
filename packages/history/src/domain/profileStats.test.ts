import { buildProfile } from '@pawnia/library'
import { describe, expect, it } from 'vitest'
import { sampleSummary as summary } from '../testing'
import type { EndReason } from './gameFacts'
import { playerGames, type GameSummary } from './playerGames'
import {
  activity,
  endings,
  openingsAs,
  profileStats,
  ratingHistory,
  repertoire,
  repertoireLines,
  type StatsGame,
} from './profileStats'

const profile = buildProfile(
  { accounts: [{ source: 'chesscom', username: 'me' }] },
  { id: 'p', now: '2026-11-05T00:00:00.000Z' },
)

let n = 0
/** A game "me" played; facts from `moves` (SAN, space-separated) and `end`. */
function game(
  overrides: Partial<GameSummary> & { as?: 'white' | 'black'; moves?: string; end?: EndReason },
): StatsGame {
  const { as = 'white', moves, end = 'resignation', ...rest } = overrides
  n++
  const [played] = playerGames(
    [
      summary({
        id: `g${n}`,
        white: { name: as === 'white' ? 'me' : 'them', rating: as === 'white' ? 1500 : 1600 },
        black: { name: as === 'white' ? 'them' : 'me', rating: as === 'white' ? 1600 : 1500 },
        ...rest,
      }),
    ],
    profile,
  )
  const san = moves?.split(' ') ?? []
  return { ...played!, ...(moves && { facts: { plies: san.length * 5, moves: san, end } }) }
}

const win = (o: Parameters<typeof game>[0] = {}) =>
  game({ ...o, result: o.as === 'black' ? '0-1' : '1-0' })
const loss = (o: Parameters<typeof game>[0] = {}) =>
  game({ ...o, result: o.as === 'black' ? '1-0' : '0-1' })
const draw = (o: Parameters<typeof game>[0] = {}) => game({ ...o, result: '1/2-1/2' })

describe('openingsAs', () => {
  it('groups one colour by family with its variations, the most played first', () => {
    const games = [
      win({ opening: { name: 'Italian Game: Giuoco Pianissimo' } }),
      loss({ opening: { name: 'Italian Game: Two Knights Defense' } }),
      win({ opening: { name: 'Italian Game: Giuoco Pianissimo' } }),
      win({ opening: { name: 'Scotch Game' } }),
      win({ as: 'black', opening: { name: 'Sicilian Defense' } }),
      win({ opening: undefined }),
    ]
    const white = openingsAs(games, 'white')
    expect(white.map((o) => [o.family, o.tally.games])).toEqual([
      ['Italian Game', 3],
      ['Scotch Game', 1],
      ['Unknown opening', 1],
    ])
    expect(white[0]!.tally).toMatchObject({ wins: 2, losses: 1, score: 67 })
    expect(white[0]!.variations.map((v) => [v.name, v.tally.games])).toEqual([
      ['Italian Game: Giuoco Pianissimo', 2],
      ['Italian Game: Two Knights Defense', 1],
    ])
    expect(openingsAs(games, 'black').map((o) => o.family)).toEqual(['Sicilian Defense'])
  })
})

describe('repertoire', () => {
  const games = [
    win({ moves: 'e4 e5 Nf3 Nc6', opening: { name: 'Italian Game' } }),
    win({ moves: 'e4 e5 Nf3 Nc6', opening: { name: 'Italian Game' } }),
    loss({ moves: 'e4 c5 Nf3 d6', opening: { name: 'Sicilian Defense' } }),
    loss({ moves: 'e4 c5 Nc3 Nc6', opening: { name: 'Sicilian Defense: Closed' } }),
    draw({ moves: 'd4 d5' }),
    win({ as: 'black', moves: 'e4 c5' }),
    win({}), // no moves known: not in the tree
  ]

  it('follows the moves of one colour, a branch per move played at least twice', () => {
    const tree = repertoire(games, 'white')
    expect(tree.tally.games).toBe(5)
    expect(tree.children.map((c) => [c.san, c.ply, c.tally.games])).toEqual([['e4', 1, 4]])
    const [e4] = tree.children
    // Two games each: in name order.
    expect(e4!.children.map((c) => [c.san, c.tally.score, c.opening])).toEqual([
      ['c5', 0, 'Sicilian Defense'],
      ['e5', 100, 'Italian Game'],
    ])
    // 2.Nf3 and 2.Nc3 after 1...c5 were played once each.
    expect(e4!.children[0]!.children).toEqual([])
    expect(e4!.children[1]!.children[0]!.children[0]).toMatchObject({ san: 'Nc6', ply: 4 })
  })

  it('flattens to lines from the start, depth first', () => {
    const lines = repertoireLines(repertoire(games, 'white'))
    expect(lines.slice(0, 3).map((l) => l.moves.join(' '))).toEqual(['e4', 'e4 c5', 'e4 e5'])
    expect(lines.at(-1)).toMatchObject({ moves: ['e4', 'e5', 'Nf3', 'Nc6'], tally: { games: 2 } })
  })

  it('as Black starts with what the opponent played', () => {
    expect(
      repertoire([...games, win({ as: 'black', moves: 'e4 e5' })], 'black').children,
    ).toMatchObject([{ san: 'e4', tally: { games: 2 } }])
  })
})

describe('endings', () => {
  it('counts the reasons per outcome and the mean length', () => {
    const result = endings([
      win({ moves: 'e4', end: 'checkmate' }),
      win({ moves: 'e4', end: 'time' }),
      win({ moves: 'e4', end: 'time' }),
      loss({ moves: 'e4', end: 'time' }),
      draw({ moves: 'e4 e5', end: 'repetition' }),
      loss({}),
    ])
    expect(result.wins).toEqual([
      { reason: 'time', games: 2 },
      { reason: 'checkmate', games: 1 },
    ])
    expect(result.losses).toEqual([
      { reason: 'other', games: 1 },
      { reason: 'time', games: 1 },
    ])
    expect(result.draws).toEqual([{ reason: 'repetition', games: 1 }])
    // 5 half-moves per SAN move in the helper: four games of 3 moves, one of 5.
    expect(result.averageMoves).toBe(3)
  })
})

describe('activity', () => {
  it('splits by time of day and weekday in the viewer’s time zone', () => {
    const games = [
      win({ playedAt: '2026-11-02T05:30:00.000Z' }), // Mon 06:30 in Berlin
      loss({ playedAt: '2026-11-02T22:30:00.000Z' }), // Mon 23:30
      win({ playedAt: '2026-11-03T23:30:00.000Z' }), // Wed 00:30
    ]
    const berlin = activity(games, 'Europe/Berlin')
    expect(berlin.dayParts.map((p) => [p.key, p.tally.games])).toEqual([
      ['night', 1],
      ['morning', 1],
      ['evening', 1],
    ])
    expect(berlin.weekdays.map((d) => [d.key, d.tally.games])).toEqual([
      ['mon', 2],
      ['wed', 1],
    ])
    expect(activity(games, 'UTC').weekdays.map((d) => d.key)).toEqual(['mon', 'tue'])
  })

  it('throws for an unknown time zone', () => {
    expect(() => activity([], 'Mars/Olympus')).toThrow(RangeError)
  })
})

describe('ratingHistory', () => {
  it('lists the rating of each rated game per platform and speed, oldest first', () => {
    const series = ratingHistory([
      win({ playedAt: '2026-10-03T00:00:00.000Z', white: { name: 'me', rating: 1520 } }),
      win({ playedAt: '2026-10-01T00:00:00.000Z', white: { name: 'me', rating: 1500 } }),
      win({ playedAt: '2026-10-02T00:00:00.000Z', rated: false }),
      win({ speed: 'blitz' }),
    ])
    expect(series.map((s) => [s.speed, s.points.map((p) => p.rating)])).toEqual([
      ['rapid', [1500, 1520]],
      ['blitz', [1500]],
    ])
  })
})

describe('profileStats', () => {
  it('puts it all together, with a row per game', () => {
    const stats = profileStats(
      [win({ moves: 'e4 e5', end: 'checkmate' }), loss({ as: 'black' })],
      'UTC',
    )
    expect(stats.record).toMatchObject({ games: 2, wins: 1, losses: 1, score: 50 })
    expect(stats.opponents.map((g) => g.key)).toEqual(['stronger (+100 or more)'])
    expect(stats.games[0]).toMatchObject({
      side: 'white',
      outcome: 'win',
      opponent: { name: 'them', rating: 1600 },
      opening: 'Italian Game Two Knights Defense',
      end: 'checkmate',
      moves: 5,
    })
    expect(stats.games[1]).not.toHaveProperty('end')
  })
})
