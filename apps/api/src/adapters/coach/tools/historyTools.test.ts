import type { CoachTool } from '@pawnia/coach'
import type { GameSummary, ReviewedMoveRow } from '@pawnia/history'
import { sampleSummary } from '@pawnia/history/testing'
import { buildProfile, type Profile } from '@pawnia/library'
import { describe, expect, it } from 'vitest'
import type { HistoryAccess } from './historyFilter'
import { searchGamesTool } from './searchGames'
import { statsTool } from './stats'

const profile = buildProfile(
  { accounts: [{ source: 'chesscom', username: '8sly' }] },
  { id: 'p', now: '2026-11-05T00:00:00.000Z' },
)

const summaries: GameSummary[] = [
  sampleSummary({
    id: 'loss',
    playedAt: '2026-11-02T20:00:00.000Z',
    white: { name: 'rival', rating: 900 },
    black: { name: '8sly', rating: 780 },
    result: '1-0',
    timeControl: '600',
    url: 'https://www.chess.com/game/live/1',
    reviewed: true,
    accuracy: { white: 88, black: 61.2 },
  }),
  sampleSummary({ id: 'win', playedAt: '2026-11-01T20:00:00.000Z' }),
  sampleSummary({
    id: 'bot',
    source: 'pawnia',
    playedAt: '2026-10-30T20:00:00.000Z',
    white: { name: 'You' },
    black: { name: 'pawnia bot (level 3)' },
    result: '*',
    rated: false,
    speed: 'unlimited',
    opening: undefined,
  }),
]
const moves: ReviewedMoveRow[] = [
  { gameId: 'loss', ply: 8, color: 'black', classification: 'mistake', pieces: 14 },
  { gameId: 'loss', ply: 30, color: 'black', classification: 'blunder', pieces: 9 },
]

const access = (owner: Profile | undefined): HistoryAccess => ({
  history: { summaries: async () => summaries, reviewedMoves: async () => moves },
  profile: async () => owner,
})

async function call(tool: CoachTool, input: unknown) {
  const parsed = tool.parse(input)
  if (!parsed.ok) throw new Error(parsed.error)
  return JSON.parse((await tool.run(parsed.value, {})).content)
}

describe('search_games', () => {
  it("lists the user's matching games from their side, newest first", async () => {
    const tool = searchGamesTool(access(profile))
    expect(await call(tool, { outcome: 'loss' })).toEqual({
      matching: 1,
      games: [
        {
          id: 'loss',
          date: '2026-11-02',
          category: 'chesscom',
          speed: 'rapid',
          timeControl: '600',
          rated: true,
          color: 'black',
          result: 'loss',
          rating: 780,
          opponent: 'rival (900)',
          opening: 'Italian Game Two Knights Defense',
          accuracy: { user: 61.2, opponent: 88 },
          reviewed: true,
          url: 'https://www.chess.com/game/live/1',
        },
      ],
    })
    const all = await call(tool, { limit: 2 })
    expect([all.matching, all.games.map((g: { id: string }) => g.id)]).toEqual([3, ['loss', 'win']])
  })

  it('says why only games played here count without a profile', async () => {
    const result = await call(searchGamesTool(access(undefined)), {})
    expect(result.games.map((g: { id: string }) => g.id)).toEqual(['bot'])
    expect(result.note).toMatch(/No profile/)
  })

  it('refuses filters it cannot apply', () => {
    const tool = searchGamesTool(access(profile))
    expect(tool.parse({ since: 'last week' }).ok).toBe(false)
    expect(tool.parse({ limit: 50 }).ok).toBe(false)
  })
})

describe('stats', () => {
  it('totals results, groups them and reports move quality with its coverage', async () => {
    const result = await call(statsTool(access(profile)), { groupBy: 'category' })
    expect(result.results).toEqual({
      games: 3,
      wins: 1,
      draws: 0,
      losses: 1,
      unfinished: 1,
      score: 50,
    })
    expect(result.groups.map((g: { key: string }) => g.key)).toEqual(['chesscom', 'bot'])
    expect(result.ratings).toHaveLength(1)
    expect(result.moveQuality).toMatchObject({
      reviewedGames: 1,
      averageAccuracy: 61,
      coverage: '1 of 3 games reviewed',
      errorsPerGame: { mistake: 1, blunder: 1 },
    })
  })

  it('can look at the newest games only', async () => {
    const result = await call(statsTool(access(profile)), { lastGames: 2 })
    expect(result.results).toMatchObject({ games: 2, wins: 1, losses: 1 })
    expect(result.moveQuality.coverage).toBe('1 of 2 games reviewed')
  })

  it('says when none of the games is reviewed', async () => {
    const result = await call(statsTool(access(profile)), { outcome: 'win' })
    expect(result.moveQuality).toMatch(/None of these 1 games is reviewed/)
    expect(result).not.toHaveProperty('groups')
  })
})
