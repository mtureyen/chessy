import { buildProfile } from '@chessy/library'
import { describe, expect, it } from 'vitest'
import { sampleSummary as summary } from '../testing'
import { filterGames, playerGames } from './playerGames'

const profile = buildProfile(
  { accounts: [{ source: 'chesscom', username: '8sly' }] },
  { id: 'p', now: '2026-11-05T00:00:00.000Z' },
)

describe('playerGames', () => {
  it("sees each game from the user's side and leaves out games they didn't play", () => {
    const games = playerGames(
      [
        summary(),
        summary({ id: 'g2', white: { name: 'rival' }, black: { name: '8SLY', rating: 800 } }),
        summary({ id: 'g3', white: { name: 'a' }, black: { name: 'b' } }),
        summary({
          id: 'g4',
          source: 'chessy',
          white: { name: 'Chessy bot (level 3)' },
          black: { name: 'You' },
          result: '*',
        }),
        summary({ id: 'g5', source: 'chessy', white: { name: 'White' }, black: { name: 'Black' } }),
      ],
      profile,
    )
    expect(games.map((g) => [g.game.id, g.category, g.side, g.outcome, g.rating])).toEqual([
      ['g1', 'chesscom', 'white', 'win', 790],
      ['g2', 'chesscom', 'black', 'loss', 800],
      ['g4', 'bot', 'black', 'unfinished', undefined],
    ])
    expect(games[1]!.opponent).toEqual({ name: 'rival' })
  })

  it('knows only bot games as the user’s without a profile', () => {
    const games = playerGames(
      [summary(), summary({ id: 'bot', source: 'chessy', white: { name: 'You' } })],
      undefined,
    )
    expect(games.map((g) => g.game.id)).toEqual(['bot'])
  })
})

describe('filterGames', () => {
  const games = playerGames(
    [
      summary(),
      summary({
        id: 'g2',
        playedAt: '2026-10-03T23:59:00.000Z',
        white: { name: 'Magnus', rating: 900 },
        black: { name: '8sly', rating: 780 },
        result: '1/2-1/2',
        speed: 'blitz',
        opening: { eco: 'B20', name: 'Sicilian Defense' },
        reviewed: true,
      }),
    ],
    profile,
  )
  const ids = (filter: Parameters<typeof filterGames>[1]) =>
    filterGames(games, filter).map((g) => g.game.id)

  it('narrows by every field it is given', () => {
    expect(ids({})).toEqual(['g1', 'g2'])
    expect(ids({ color: 'black' })).toEqual(['g2'])
    expect(ids({ outcome: 'win' })).toEqual(['g1'])
    expect(ids({ opponent: 'mag' })).toEqual(['g2'])
    expect(ids({ opening: 'italian' })).toEqual(['g1'])
    expect(ids({ opening: 'B2' })).toEqual(['g2'])
    expect(ids({ speed: 'blitz', reviewed: true })).toEqual(['g2'])
    expect(ids({ since: '2026-10-02', until: '2026-10-03' })).toEqual(['g2'])
    expect(ids({ category: 'lichess' })).toEqual([])
  })
})
