import {
  SourceUnavailableError,
  UserNotFoundError,
  type GameSource,
  type SourceGame,
} from '@chessy/library'
import { sampleSourceGame } from '@chessy/library/testing'
import { describe, expect, it } from 'vitest'
import type { EngineService, EngineStatus } from './adapters/engine/service'
import { createApp } from './app'

function fakeSource(
  id: 'lichess' | 'chesscom',
  answer: (username: string, max: number) => SourceGame[],
): GameSource {
  return { id, recentGames: async (username, { max }) => answer(username, max) }
}

const games: SourceGame[] = [sampleSourceGame(), sampleSourceGame()]
const requests: { username: string; max: number }[] = []

let engineStatus: EngineStatus = { available: true, name: 'FakeFish 1', parallelism: 3 }
const engineRequests: unknown[] = []
const engine: EngineService = {
  status: async () => engineStatus,
  async evaluate(request, options) {
    engineRequests.push(request)
    if (request.nodes === 13_000) throw new Error('engine crashed')
    const evals = request.fens.map(() => ({ depth: 9, lines: [] }))
    // Report out of order, like a pool does.
    for (const i of [...evals.keys()].reverse()) options?.onEvaluated?.(i, evals[i]!)
    return evals
  },
}

const app = createApp({
  engine,
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
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/engine',
      '/engine/evaluations',
      '/health',
      '/sources/{source}/users/{username}/games',
    ])
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

describe('engine routes', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const post = (body: unknown) =>
    app.request('/api/v1/engine/evaluations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const events = async (res: Response) =>
    (await res.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { type: string; index?: number })

  it('GET /api/v1/engine reports the native engine', async () => {
    const res = await app.request('/api/v1/engine')
    expect(await res.json()).toEqual({ available: true, name: 'FakeFish 1', parallelism: 3 })
  })

  it('streams one event per position, then done', async () => {
    const res = await post({ fens: [START, START], nodes: 100_000, multiPv: 2 })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')
    expect(await events(res)).toEqual([
      { type: 'evaluated', index: 1, eval: { depth: 9, lines: [] } },
      { type: 'evaluated', index: 0, eval: { depth: 9, lines: [] } },
      { type: 'done' },
    ])
    expect(engineRequests.at(-1)).toEqual({ fens: [START, START], nodes: 100_000, multiPv: 2 })
  })

  it('ends the stream with an error event when the engine fails', async () => {
    const res = await post({ fens: [START], nodes: 13_000, multiPv: 1 })
    expect((await events(res)).at(-1)).toEqual({ type: 'error', message: 'engine crashed' })
  })

  it('rejects invalid requests and positions', async () => {
    const tooMany = await post({ fens: [START], nodes: 10_000_000, multiPv: 1 })
    expect(tooMany.status).toBe(400)
    expect(tooMany.headers.get('content-type')).toContain('application/problem+json')
    const badFen = await post({ fens: [START, 'nonsense'], nodes: 10_000, multiPv: 1 })
    expect(badFen.status).toBe(400)
    expect(await badFen.json()).toMatchObject({
      title: 'Invalid position',
      detail: expect.stringContaining('fens[1]'),
    })
    const notJson = await app.request('/api/v1/engine/evaluations', { method: 'POST', body: 'x' })
    expect(notJson.status).toBe(400)
  })

  it('answers 503 without a native engine', async () => {
    engineStatus = { available: false, reason: 'no binary' }
    const res = await post({ fens: [START], nodes: 10_000, multiPv: 1 })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ title: 'Engine unavailable', detail: 'no binary' })
    engineStatus = { available: true, name: 'FakeFish 1', parallelism: 3 }
  })
})
