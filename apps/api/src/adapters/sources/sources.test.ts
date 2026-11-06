import { readFileSync } from 'node:fs'
import { GameNotFoundError, SourceUnavailableError, UserNotFoundError } from '@chessy/library'
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

  const gameWithOpening = (eco: string) => ({
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

  it('cuts the move sequence off opening names, also when it hangs off a word', async () => {
    const fetch: Fetch = async (url) =>
      url.endsWith('/archives')
        ? Response.json({ archives: ['https://api.chess.com/pub/player/a/games/2026/10'] })
        : Response.json({
            games: [
              gameWithOpening(
                'https://www.chess.com/openings/Sicilian-Defense-Kan-Modern-Variation...9.Nc3-Bg7',
              ),
              gameWithOpening(
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

  it('gives a game with the opening "Undefined" no name', async () => {
    const fetch: Fetch = async (url) =>
      url.endsWith('/archives')
        ? Response.json({ archives: ['https://api.chess.com/pub/player/a/games/2026/10'] })
        : Response.json({ games: [gameWithOpening('https://www.chess.com/openings/Undefined')] })
    const [game] = await new ChessComGameSource({ fetch, userAgent }).recentGames('a1', { max: 5 })
    expect(game?.opening).toEqual({ eco: 'B42' })
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

describe('single games', () => {
  it('fetches a lichess game by id, and reports unknown ones as missing games', async () => {
    const { fetch, requests } = spyFetch()
    const source = new LichessGameSource({ fetch, userAgent })
    const game = await source.game('HqjDTU4A')
    expect(game).toMatchObject({ source: 'lichess', externalId: 'HqjDTU4A' })
    expect(new URL(requests[0]!.url).pathname).toBe('/game/export/HqjDTU4A')
    expect(requests[0]!.headers.Accept).toBe('application/json')
    await expect(source.game('zzzzzzz1')).rejects.toBeInstanceOf(GameNotFoundError)
  })

  it('finds a chess.com game among the user’s archives, newest month first', async () => {
    const { fetch, requests } = spyFetch()
    const source = new ChessComGameSource({ fetch, userAgent })
    const game = await source.game('185932092650', { username: 'Hikaru' })
    expect(game.url).toBe('https://www.chess.com/game/live/185932092650')
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([
      '/pub/player/hikaru/games/archives',
      '/pub/player/hikaru/games/2026/10',
    ])
    await expect(source.game('1', { username: 'hikaru' })).rejects.toThrow(/not among hikaru/)
    await expect(source.game('1', {})).rejects.toBeInstanceOf(GameNotFoundError)
    await expect(source.game('1', { username: 'ghost' })).rejects.toBeInstanceOf(UserNotFoundError)
  })
})

describe('player profiles', () => {
  it('reads a chess.com profile and its standard ratings', async () => {
    const { fetch, requests } = spyFetch()
    const player = await new ChessComGameSource({ fetch, userAgent }).player('Hikaru')
    expect(player).toEqual({
      source: 'chesscom',
      username: 'Hikaru',
      url: 'https://www.chess.com/member/Hikaru',
      title: 'GM',
      name: 'Hikaru Nakamura',
      avatarUrl: expect.stringMatching(/^https:\/\/images\.chesscomfiles\.com\//),
      country: 'US',
      ratings: { bullet: 3393, blitz: 3467, rapid: 2838, correspondence: 2239 },
    })
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([
      '/pub/player/hikaru',
      '/pub/player/hikaru/stats',
    ])
  })

  it('reads a lichess profile, leaving out ratings without games', async () => {
    const { fetch } = spyFetch()
    const player = await new LichessGameSource({ fetch, userAgent }).player('drnykterstein')
    expect(player).toMatchObject({ source: 'lichess', username: 'DrNykterstein', title: 'GM' })
    expect(player.ratings).toEqual({ bullet: 3263, blitz: 3194 })
    expect(player.avatarUrl).toBeUndefined()
  })

  it('reports unknown players', async () => {
    const { fetch } = spyFetch()
    await expect(
      new ChessComGameSource({ fetch, userAgent }).player('ghost'),
    ).rejects.toBeInstanceOf(UserNotFoundError)
    await expect(
      new LichessGameSource({ fetch, userAgent }).player('ghost'),
    ).rejects.toBeInstanceOf(UserNotFoundError)
  })
})

describe('whole histories', () => {
  it('pages through chess.com month by month, newest first, fetching the archive list once', async () => {
    const { fetch, requests } = spyFetch()
    const source = new ChessComGameSource({ fetch, userAgent })
    const first = await source.history('Hikaru', {})
    expect(first.progress).toEqual({ done: 1, total: 2 })
    expect(first.next).toBe('2:2026/09')
    expect(first.games.map((g) => g.playedAt)).toEqual(
      [...first.games.map((g) => g.playedAt)].sort().reverse(),
    )
    const second = await source.history('Hikaru', { cursor: first.next! })
    expect(second).toMatchObject({ progress: { done: 2, total: 2 } })
    expect(second.next).toBeUndefined()
    expect(first.games.length + second.games.length).toBe(5)
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([
      '/pub/player/hikaru/games/archives',
      '/pub/player/hikaru/games/2026/10',
      '/pub/player/hikaru/games/2026/09',
    ])
  })

  it('catches up on chess.com: only months and games since a date', async () => {
    const { fetch, requests } = spyFetch()
    const source = new ChessComGameSource({ fetch, userAgent })
    const page = await source.history('hikaru', { since: '2026-10-15T00:00:00.000Z' })
    expect(page.progress).toEqual({ done: 1, total: 1 })
    expect(page.games.every((g) => g.playedAt >= '2026-10-15T00:00:00.000Z')).toBe(true)
    expect(requests).toHaveLength(2) // archives + October only
  })

  it('pages lichess by time, asking for games before the last page’s oldest', async () => {
    const { fetch, requests } = spyFetch()
    const page = await new LichessGameSource({ fetch, userAgent }).history('DrNykterstein', {
      cursor: '1760000000000:200',
      since: '2026-01-01T00:00:00.000Z',
    })
    const query = new URL(requests[0]!.url).searchParams
    expect(query.get('until')).toBe('1760000000000')
    expect(query.get('since')).toBe(String(Date.parse('2026-01-01T00:00:00.000Z')))
    expect(query.get('max')).toBe('200')
    expect(page.next).toBeUndefined() // fewer than a full page: the end
    expect(page.progress.done).toBe(200 + lichessLines.length)
  })
})
