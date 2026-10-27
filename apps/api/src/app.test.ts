import {
  SourceUnavailableError,
  UserNotFoundError,
  type GameSource,
  type SourceGame,
} from '@chessy/library'
import { sampleGame } from '@chessy/library/testing'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'

function fakeSource(
  id: 'lichess' | 'chesscom',
  answer: (username: string, max: number) => SourceGame[],
): GameSource {
  return { id, recentGames: async (username, { max }) => answer(username, max) }
}

const games: SourceGame[] = [sampleGame(), sampleGame()].map(
  ({ id: _id, importedAt: _at, ...game }) => game,
)
const requests: { username: string; max: number }[] = []

const app = createApp({
  version: '9.9.9',
  startedAt: 1_000,
  now: () => 61_000,
  sources: {
    lichess: fakeSource('lichess', (username, max) => {
      requests.push({ username, max })
      if (username === 'ghost') throw new UserNotFoundError('lichess', username)
      if (username === 'busy') throw new SourceUnavailableError('lichess', 'rate limited', 60)
      if (username === 'down') throw new SourceUnavailableError('lichess', 'HTTP 503')
      return games.slice(0, max)
    }),
    chesscom: fakeSource('chesscom', () => []),
  },
})

describe('api', () => {
  it('GET /api/v1/health', async () => {
    const res = await app.request('/api/v1/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'ok',
      service: 'chessy-api',
      version: '9.9.9',
      uptimeSeconds: 60,
    })
  })

  it('serves the OpenAPI document generated from the contracts', async () => {
    const res = await app.request('/api/v1/openapi.json')
    const doc = (await res.json()) as { paths: Record<string, unknown>; servers: { url: string }[] }
    expect(doc.servers[0]?.url).toBe('/api/v1')
    expect(Object.keys(doc.paths)).toEqual(['/health', '/sources/{source}/users/{username}/games'])
  })

  it('serves API docs', async () => {
    const res = await app.request('/api/v1/docs')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('answers unknown routes with a problem document', async () => {
    const res = await app.request('/api/v1/nope')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(await res.json()).toMatchObject({
      status: 404,
      title: 'Not Found',
      instance: '/api/v1/nope',
    })
  })
})

describe('GET /api/v1/sources/{source}/users/{username}/games', () => {
  const get = (path: string) => app.request(`/api/v1/sources/${path}`)

  it('returns the games, 20 by default', async () => {
    const res = await get('lichess/users/alice/games')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ games })
    expect(requests.at(-1)).toEqual({ username: 'alice', max: 20 })

    await get('lichess/users/alice/games?max=1')
    expect(requests.at(-1)).toEqual({ username: 'alice', max: 1 })
  })

  it('validates source, username and max', async () => {
    for (const path of [
      'fics/users/alice/games',
      'lichess/users/a%20b/games',
      'lichess/users/alice/games?max=500',
    ]) {
      const res = await get(path)
      expect(res.status, path).toBe(400)
      expect(res.headers.get('content-type')).toContain('application/problem+json')
    }
  })

  it('maps source errors to 404, 429 (with Retry-After) and 502', async () => {
    const notFound = await get('lichess/users/ghost/games')
    expect(notFound.status).toBe(404)
    expect(await notFound.json()).toMatchObject({
      title: 'User not found',
      detail: 'No lichess user "ghost"',
    })

    const busy = await get('lichess/users/busy/games')
    expect(busy.status).toBe(429)
    expect(busy.headers.get('Retry-After')).toBe('60')

    expect((await get('lichess/users/down/games')).status).toBe(502)
  })
})
