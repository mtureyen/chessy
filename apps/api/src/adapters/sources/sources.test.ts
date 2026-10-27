import { readFileSync } from 'node:fs'
import { SourceUnavailableError, UserNotFoundError } from '@chessy/library'
import { describe, expect, it } from 'vitest'
import { ChessComGameSource } from './chesscom'
import type { Fetch } from './http'
import { LichessGameSource } from './lichess'
import { recordedFetch } from './recorded'

const userAgent = 'Chessy-test'

/** Records requests, answers via recordedFetch (or a custom handler). */
function spyFetch(handler: Fetch = recordedFetch) {
  const requests: { url: string; headers: Record<string, string> }[] = []
  const fetch: Fetch = (url, init) => {
    requests.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    return handler(url, init)
  }
  return { fetch, requests }
}

const lichessLines = readFileSync(
  new URL('./fixtures/lichess-games.ndjson', import.meta.url),
  'utf8',
)
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Record<string, unknown>)

describe('LichessGameSource', () => {
  it('maps recorded games', async () => {
    const { fetch, requests } = spyFetch()
    const games = await new LichessGameSource({ fetch, userAgent }).recentGames('DrNykterstein', {
      max: 2,
    })
    expect(games).toHaveLength(2)
    expect(games[0]).toMatchObject({
      source: 'lichess',
      externalId: 'HqjDTU4A',
      url: 'https://lichess.org/HqjDTU4A',
      white: { name: 'DrNykterstein', rating: 3177 },
      black: { name: 'Night-King96', rating: 2848 },
      result: '1-0',
      speed: 'blitz',
      timeControl: '180+0',
      rated: true,
      opening: { eco: 'A50', name: "Queen's Indian Accelerated" },
    })
    expect(games[0]!.playedAt).toBe(new Date(1792001046539).toISOString())
    expect(games[0]!.pgn).toContain('[%clk 0:03:00]')

    const url = new URL(requests[0]!.url)
    expect(url.pathname).toBe('/api/games/user/DrNykterstein')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      max: '2',
      pgnInJson: 'true',
      clocks: 'true',
      opening: 'true',
    })
    expect(requests[0]!.headers).toMatchObject({
      Accept: 'application/x-ndjson',
      'User-Agent': userAgent,
    })
  })

  it('skips variants it cannot replay and names AI opponents', async () => {
    const [game] = lichessLines
    const lines = [
      { ...game, id: 'chess960', variant: 'chess960' },
      {
        ...game,
        id: 'vsAi',
        players: { white: { aiLevel: 8 }, black: (game!.players as { black: unknown }).black },
      },
    ]
    const source = new LichessGameSource({
      userAgent,
      fetch: async () => new Response(lines.map((l) => JSON.stringify(l)).join('\n')),
    })
    const games = await source.recentGames('someone', { max: 5 })
    expect(games.map((g) => g.externalId)).toEqual(['vsAi'])
    expect(games[0]!.white).toEqual({ name: 'Stockfish level 8' })
  })

  it('maps platform errors to library errors', async () => {
    const source = (status: number, headers: Record<string, string> = {}) =>
      new LichessGameSource({ userAgent, fetch: async () => new Response('', { status, headers }) })
    await expect(source(404).recentGames('ghost', { max: 1 })).rejects.toBeInstanceOf(
      UserNotFoundError,
    )
    await expect(source(429).recentGames('x1', { max: 1 })).rejects.toMatchObject({
      retryAfterSeconds: 60,
    })
    await expect(
      source(429, { 'Retry-After': '30' }).recentGames('x1', { max: 1 }),
    ).rejects.toMatchObject({
      retryAfterSeconds: 30,
    })
    await expect(source(503).recentGames('x1', { max: 1 })).rejects.toBeInstanceOf(
      SourceUnavailableError,
    )
    const offline = new LichessGameSource({
      userAgent,
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
    })
    await expect(offline.recentGames('x1', { max: 1 })).rejects.toThrow(/network error/)
  })
})

describe('ChessComGameSource', () => {
  it('returns the newest games first, across months, only fetching what it needs', async () => {
    const { fetch, requests } = spyFetch()
    const source = new ChessComGameSource({ fetch, userAgent })

    const four = await source.recentGames('Hikaru', { max: 4 })
    expect(four.map((g) => g.playedAt)).toEqual([...four.map((g) => g.playedAt)].sort().reverse())
    expect(four.slice(0, 3).every((g) => g.playedAt.startsWith('2026-10'))).toBe(true)
    expect(four[3]!.playedAt.startsWith('2026-09')).toBe(true)
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([
      '/pub/player/hikaru/games/archives',
      '/pub/player/hikaru/games/2026/10',
      '/pub/player/hikaru/games/2026/09',
    ])

    requests.length = 0
    await source.recentGames('hikaru', { max: 2 })
    expect(requests).toHaveLength(2)
  })

  it('maps players, result, speed and the opening name from the URL slug', async () => {
    const [newest] = await new ChessComGameSource({ fetch: recordedFetch, userAgent }).recentGames(
      'hikaru',
      { max: 1 },
    )
    expect(newest).toMatchObject({
      source: 'chesscom',
      externalId: '8dda7510-d093-11f1-8cd7-777c7b01000f',
      url: 'https://www.chess.com/game/live/185932492614',
      white: { name: 'KodandaPrime', rating: 3144 },
      black: { name: 'Hikaru', rating: 3470 },
      result: '0-1',
      speed: 'blitz',
      timeControl: '180',
      opening: { eco: 'A07', name: 'Kings Indian Attack Double Fianchetto Variation' },
    })
  })

  it('cuts the move sequence off opening names, also when it hangs off a word', async () => {
    const game = (eco: string) => ({
      uuid: eco,
      url: 'https://www.chess.com/game/live/1',
      pgn: '[ECO "B42"]\n[Result "1-0"]',
      end_time: 1,
      rated: true,
      rules: 'chess',
      time_class: 'blitz',
      time_control: '180',
      white: { username: 'a' },
      black: { username: 'b' },
      eco,
    })
    const fetch: Fetch = async (url) =>
      url.endsWith('/archives')
        ? Response.json({ archives: ['https://api.chess.com/pub/player/a/games/2026/10'] })
        : Response.json({
            games: [
              game(
                'https://www.chess.com/openings/Sicilian-Defense-Kan-Modern-Variation...9.Nc3-Bg7',
              ),
              game(
                'https://www.chess.com/openings/Caro-Kann-Defense-Two-Knights-Mindeno-Exchange-Line',
              ),
            ],
          })
    const games = await new ChessComGameSource({ fetch, userAgent }).recentGames('a1', { max: 5 })
    expect(games.map((g) => g.opening?.name).sort()).toEqual([
      'Caro Kann Defense Two Knights Mindeno Exchange Line',
      'Sicilian Defense Kan Modern Variation',
    ])
  })

  it('skips variants, maps daily games, reports unknown users', async () => {
    const base = {
      uuid: 'u',
      url: 'https://www.chess.com/game/daily/1',
      pgn: '[Result "1-0"]',
      end_time: 1,
      rated: true,
    }
    const players = { white: { username: 'a' }, black: { username: 'b' } }
    const fetch: Fetch = async (url) =>
      url.endsWith('/archives')
        ? Response.json({ archives: ['https://api.chess.com/pub/player/a/games/2026/10'] })
        : Response.json({
            games: [
              {
                ...base,
                ...players,
                uuid: 'daily',
                rules: 'chess',
                time_class: 'daily',
                time_control: '1/86400',
              },
              {
                ...base,
                ...players,
                uuid: '960',
                rules: 'chess960',
                time_class: 'blitz',
                time_control: '180',
              },
            ],
          })
    const games = await new ChessComGameSource({ fetch, userAgent }).recentGames('a1', { max: 5 })
    expect(games.map((g) => [g.externalId, g.speed, g.timeControl])).toEqual([
      ['daily', 'correspondence', undefined],
    ])

    await expect(
      new ChessComGameSource({ fetch: recordedFetch, userAgent }).recentGames('nobody_here', {
        max: 1,
      }),
    ).rejects.toBeInstanceOf(UserNotFoundError)
  })
})
