import type { GameSummary, ReviewedMoveRow } from '@pawnia/history'
import { sampleSummary } from '@pawnia/history/testing'
import {
  buildProfile,
  SourceUnavailableError,
  UserNotFoundError,
  type GameSource,
  type SourceGame,
  type SourceId,
} from '@pawnia/library'
import { sampleSourceGame } from '@pawnia/library/testing'
import { describe, expect, it } from 'vitest'
import { LiveStats, type StatsLibrary } from './liveStats'

const MATE = '[Result "1-0"]\n[Termination "Normal"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'
const profile = buildProfile(
  { accounts: [{ source: 'chesscom', username: 'me' }] },
  { id: 'p', now: '2026-11-01T00:00:00.000Z' },
)

function library(summaries: GameSummary[], moves: ReviewedMoveRow[] = []) {
  const asked: string[][] = []
  const fake: StatsLibrary = {
    summaries: async () => summaries,
    reviewedMoves: async () => moves,
    profile: async () => profile,
    pgns: async (ids) => {
      asked.push([...ids])
      return new Map(ids.map((id) => [id, MATE]))
    },
  }
  return { fake, asked }
}

function platform(id: SourceId, games: SourceGame[]) {
  let calls = 0
  const fake: GameSource = {
    id,
    recentGames: () => Promise.reject(new Error('unused')),
    game: () => Promise.reject(new Error('unused')),
    player: async (username) => {
      if (username === 'ghost') throw new UserNotFoundError(id, username)
      return { source: id, username: 'Alice', url: 'https://lichess.org/@/Alice', ratings: {} }
    },
    history: async () => {
      calls++
      return { games, progress: { done: 1, total: 1 } }
    },
  }
  return { fake, calls: () => calls }
}

const mine = (overrides: Partial<GameSummary>) =>
  sampleSummary({ white: { name: 'me', rating: 1500 }, ...overrides })

describe('LiveStats.mine', () => {
  it('counts the platform games, reads each PGN once and adds move quality', async () => {
    const { fake, asked } = library([
      mine({
        id: 'new',
        playedAt: '2026-10-03T00:00:00.000Z',
        reviewed: true,
        accuracy: { white: 80 },
      }),
      mine({ id: 'bot', source: 'pawnia', white: { name: 'You' } }),
      mine({
        id: 'old',
        playedAt: '2026-10-01T00:00:00.000Z',
        reviewed: true,
        accuracy: { white: 60 },
      }),
    ])
    const stats = new LiveStats({ library: fake, sources: {} as Record<SourceId, GameSource> })
    const body = await stats.mine({ last: 30, tz: 'UTC' })
    expect(body.player).toEqual({ kind: 'me', displayName: 'me', accounts: profile.accounts })
    expect(body.window).toEqual({ last: 30, found: 2 })
    expect(body.endings.wins).toEqual([{ reason: 'checkmate', games: 2 }])
    expect(body.quality).toMatchObject({
      reviewedGames: 2,
      averageAccuracy: 70,
      accuracy: [
        { at: '2026-10-01T00:00:00.000Z', accuracy: 60 },
        { at: '2026-10-03T00:00:00.000Z', accuracy: 80 },
      ],
    })
    await stats.mine({ last: 30, tz: 'UTC' })
    expect(asked).toEqual([['new', 'old']])
  })

  it('has no move quality without reviewed games', async () => {
    const { fake } = library([mine({})])
    const stats = new LiveStats({ library: fake, sources: {} as Record<SourceId, GameSource> })
    expect(await stats.mine({ last: 30, tz: 'UTC' })).not.toHaveProperty('quality')
  })
})

describe('LiveStats.player', () => {
  const game = () => sampleSourceGame({ white: { name: 'Alice', rating: 1500 } })

  it('reads the platform once per ten minutes and says how far back it read', async () => {
    let now = Date.parse('2026-11-10T12:00:00.000Z')
    const lichess = platform('lichess', [game(), game()])
    const stats = new LiveStats({
      library: library([]).fake,
      sources: { lichess: lichess.fake, chesscom: platform('chesscom', []).fake },
      now: () => now,
    })
    const body = await stats.player('lichess', 'alice', { last: 100, tz: 'UTC' })
    expect(body.player).toMatchObject({ kind: 'lookup', profile: { username: 'Alice' } })
    expect(body.window).toEqual({
      last: 100,
      found: 2,
      since: '2025-11-10T12:00:00.000Z',
      more: false,
    })
    expect(body).not.toHaveProperty('quality')

    // Another time zone or spelling: the same games.
    await stats.player('lichess', 'ALICE', { last: 100, tz: 'Europe/Berlin' })
    expect(lichess.calls()).toBe(1)
    now += 10 * 60_000
    await stats.player('lichess', 'alice', { last: 100, tz: 'UTC' })
    expect(lichess.calls()).toBe(2)
  })

  it("doesn't keep a failed lookup", async () => {
    const lichess = platform('lichess', [game()])
    const player = lichess.fake.player
    let failures = 1
    lichess.fake.player = (username) =>
      failures-- > 0
        ? Promise.reject(new SourceUnavailableError('lichess', 'HTTP 503'))
        : player(username)
    const stats = new LiveStats({
      library: library([]).fake,
      sources: { lichess: lichess.fake, chesscom: platform('chesscom', []).fake },
    })
    const query = { last: 30, tz: 'UTC' }
    await expect(stats.player('lichess', 'alice', query)).rejects.toThrow(SourceUnavailableError)
    expect((await stats.player('lichess', 'alice', query)).window.found).toBe(1)
    await expect(stats.player('lichess', 'ghost', query)).rejects.toThrow(UserNotFoundError)
  })
})
