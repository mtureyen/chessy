import {
  GameNotFoundError,
  SourceUnavailableError,
  UserNotFoundError,
  type GameSource,
  type SourceGame,
} from '@chessy/library'
import { CoachEventSchema } from '@chessy/contracts'
import { InMemoryConversationStore, LoopAgent } from '@chessy/coach'
import { scriptedClient } from '@chessy/coach/testing'
import { sampleReview } from '@chessy/history/testing'
import { sampleGame, sampleSourceGame } from '@chessy/library/testing'
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CoachRegistry } from './adapters/coach/agents'
import { evaluatePositionTool } from './adapters/coach/tools/evaluatePosition'
import { FileSettingsService } from './adapters/settings/fileSettingsService'
import { FileSettingsStore } from './adapters/settings/fileSettingsStore'
import { loadConfig } from './config'
import { openDatabase } from './adapters/db/database'
import { DatabaseLibraryService } from './adapters/db/service'
import type { EngineService, EngineStatus } from './adapters/engine/service'
import type { HumanMoveService, HumanMovesStatus } from './adapters/humanMoves/service'
import { ReviewQueueBusyError, type ReviewQueueService } from './adapters/review/reviewQueueService'
import { createApp } from './app'

function fakeSource(
  id: 'lichess' | 'chesscom',
  answer: (username: string, max: number) => SourceGame[],
): GameSource {
  return {
    id,
    recentGames: async (username, { max }) => answer(username, max),
    async game(gameId, { username }) {
      if (gameId === 'HqjDTU4A') return games[0]!
      throw new GameNotFoundError(
        id,
        gameId,
        username ? `not among ${username}'s games` : undefined,
      )
    },
    async history(username, { cursor }) {
      if (username === 'ghost') throw new UserNotFoundError(id, username)
      return cursor
        ? { games: [games[1]!], progress: { done: 2, total: 2 } }
        : { games: [games[0]!], next: '2:2026/09', progress: { done: 1, total: 2 } }
    },
    async player(username) {
      if (username === 'ghost') throw new UserNotFoundError(id, username)
      return {
        source: id,
        username,
        url: `https://example.com/${username}`,
        ratings: { rapid: 780 },
      }
    },
  }
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
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

let humanStatus: HumanMovesStatus = { available: true, name: 'FakeMaia' }
const humanMoves: HumanMoveService = {
  status: async () => humanStatus,
  // A fixed answer per move: e2e4 is likely, anything else rare.
  moveProbabilities: async (queries) => queries.map((q) => (q.move === 'e2e4' ? 0.6 : 0.01)),
  predict: async ({ eloSelf }) => ({
    moves: [
      { move: 'e2e4', probability: eloSelf / 2000 },
      { move: 'd2d4', probability: 1 - eloSelf / 2000 },
    ],
    expectedScore: 0.55,
  }),
}

const library = new DatabaseLibraryService(() => openDatabase('pglite:memory'))
const coachModel = scriptedClient([
  { text: 'Let me look. ', toolCalls: [{ name: 'evaluate_position', input: { fen: START_FEN } }] },
  { text: 'Both sides are equal.' },
])
const coach = [
  new LoopAgent({
    id: 'scripted',
    label: 'Scripted coach',
    client: coachModel.client,
    tools: [evaluatePositionTool(engine)],
    conversations: new InMemoryConversationStore(),
  }),
]
const settingsPath = join(mkdtempSync(join(tmpdir(), 'chessy-app-test-')), 'settings.json')
const settingsRegistry = new CoachRegistry([], {
  baseUrl: 'http://127.0.0.1:3000',
  version: 'test',
})
const settings = new FileSettingsService(
  loadConfig({ ANTHROPIC_API_KEY: 'sk-ant-from-env-0000000000-envk' }),
  new FileSettingsStore(settingsPath),
  settingsRegistry,
)
/** Answers like the real queue; its work has tests of its own. */
const reviewQueue: ReviewQueueService = {
  status: () => ({ status: 'idle', total: 0, done: 0, failed: 0 }),
  start: async ({ count }) => {
    if (count === 13) throw new ReviewQueueBusyError()
    if (count === 14) throw new Error('No database configured (DATABASE_URL)')
    return { status: 'running', total: count, done: 0, failed: 0 }
  },
  pause: async () => ({ status: 'paused', total: 30, done: 3, failed: 0 }),
  resume: async () => ({ status: 'running', total: 30, done: 3, failed: 0 }),
}

const app = createApp({
  engine,
  humanMoves,
  library,
  reviewQueue,
  coach: { agents: () => coach },
  settings,
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
      '/coach',
      '/coach/comments',
      '/coach/messages',
      '/engine',
      '/engine/evaluations',
      '/health',
      '/human-moves',
      '/human-moves/predict',
      '/human-moves/probabilities',
      '/library',
      '/library/games',
      '/library/games/missing',
      '/library/review-queue',
      '/library/review-queue/pause',
      '/library/review-queue/resume',
      '/library/reviews',
      '/profile',
      '/settings/coach',
      '/sources/{source}/games/{id}',
      '/sources/{source}/users/{username}',
      '/sources/{source}/users/{username}/games',
      '/sources/{source}/users/{username}/history',
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

describe('human-move routes', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const post = (body: unknown) =>
    app.request('/api/v1/human-moves/probabilities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('GET /api/v1/human-moves reports the model', async () => {
    const res = await app.request('/api/v1/human-moves')
    expect(await res.json()).toEqual({ available: true, name: 'FakeMaia' })
  })

  it('answers one probability per query, in order', async () => {
    const res = await post({
      queries: [
        { fen: START, move: 'e2e4', eloSelf: 1500, eloOppo: 1500 },
        { fen: START, move: 'a2a3', eloSelf: 900, eloOppo: 1200 },
      ],
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ probabilities: [0.6, 0.01] })
  })

  it('rejects invalid requests and positions', async () => {
    expect((await post({ queries: [] })).status).toBe(400)
    expect(
      (await post({ queries: [{ fen: START, move: 'e9e4', eloSelf: 1500, eloOppo: 1500 }] }))
        .status,
    ).toBe(400)
    const invalid = await post({
      queries: [{ fen: 'nonsense', move: 'e2e4', eloSelf: 1500, eloOppo: 1500 }],
    })
    expect(invalid.status).toBe(400)
    expect(((await invalid.json()) as { detail: string }).detail).toMatch(/queries\[0\]\.fen/)
  })

  it('answers 503 without a model', async () => {
    humanStatus = { available: false, reason: 'No Maia model' }
    try {
      const res = await post({
        queries: [{ fen: START, move: 'e2e4', eloSelf: 1500, eloOppo: 1500 }],
      })
      expect(res.status).toBe(503)
      expect(((await res.json()) as { detail: string }).detail).toBe('No Maia model')
    } finally {
      humanStatus = { available: true, name: 'FakeMaia' }
    }
  })

  const predict = (body: unknown) =>
    app.request('/api/v1/human-moves/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('predicts the moves a player of the rating would play', async () => {
    const res = await predict({ fen: START, eloSelf: 1200, eloOppo: 1000 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      moves: [
        { move: 'e2e4', probability: 0.6 },
        { move: 'd2d4', probability: 0.4 },
      ],
      expectedScore: 0.55,
    })
  })

  it('rejects an invalid position and answers 503 without a model', async () => {
    const invalid = await predict({ fen: 'nonsense', eloSelf: 1200, eloOppo: 1200 })
    expect(invalid.status).toBe(400)
    expect((await predict({ fen: START, eloSelf: 50, eloOppo: 1200 })).status).toBe(400)
    humanStatus = { available: false, reason: 'No Maia model' }
    try {
      expect((await predict({ fen: START, eloSelf: 1200, eloOppo: 1200 })).status).toBe(503)
    } finally {
      humanStatus = { available: true, name: 'FakeMaia' }
    }
  })
})

describe('GET /api/v1/sources/{source}/games/{id}', () => {
  it('returns the game', async () => {
    const res = await app.request('/api/v1/sources/lichess/games/HqjDTU4A')
    expect(res.status).toBe(200)
    expect(((await res.json()) as { game: SourceGame }).game).toEqual(games[0])
  })

  it('answers 404 for an unknown game and 400 for invalid ids or usernames', async () => {
    const missing = await app.request('/api/v1/sources/chesscom/games/123?username=8sly')
    expect(missing.status).toBe(404)
    expect(((await missing.json()) as { detail: string }).detail).toMatch(/8sly/)
    expect((await app.request('/api/v1/sources/lichess/games/no%20way')).status).toBe(400)
    expect((await app.request('/api/v1/sources/chesscom/games/1?username=x')).status).toBe(400)
  })
})

describe('library routes', () => {
  // Starting the embedded database takes a few seconds on slow machines: not inside a test.
  beforeAll(() => library.status(), 60_000)
  const post = (path: string, body: unknown) =>
    app.request(`/api/v1/library${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const game = sampleGame({ id: 'lib-1', externalId: 'lib-ext-1' })

  it('keeps games, tells which ones it lacks and reports what it holds', async () => {
    expect((await post('/games', { games: [game] })).status).toBe(200)
    const missing = await post('/games/missing', { ids: ['lib-1', 'lib-2'] })
    expect(await missing.json()).toEqual({ missing: ['lib-2'] })
    const status = await app.request('/api/v1/library')
    expect(await status.json()).toMatchObject({ available: true, games: 1 })
  })

  it('rejects unreadable PGNs and a platform game under a second id', async () => {
    const broken = await post('/games', { games: [{ ...game, id: 'lib-3', pgn: '1. e5 e4' }] })
    expect(broken.status).toBe(400)
    const twice = await post('/games', { games: [{ ...game, id: 'lib-4' }] })
    expect(twice.status).toBe(409)
  })

  it('keeps a review of a line, and only of the moves it was sent with', async () => {
    const { line, review } = sampleReview()
    const ok = await post('/reviews', { ...line, review })
    expect(ok.status).toBe(200)
    expect(await (await app.request('/api/v1/library')).json()).toMatchObject({ reviews: 1 })
    const other = await post('/reviews', { ...line, moves: ['d2d4', 'd7d5'], review })
    expect(other.status).toBe(400)
  })

  it('answers 503 without a database', async () => {
    const offline = createApp({
      engine,
      humanMoves,
      library: new DatabaseLibraryService(undefined),
      reviewQueue,
      coach: { agents: () => [] },
      settings,
      version: '9.9.9',
      startedAt: 0,
      sources: {
        lichess: fakeSource('lichess', () => []),
        chesscom: fakeSource('chesscom', () => []),
      },
    })
    const status = await offline.request('/api/v1/library')
    expect(await status.json()).toMatchObject({ available: false })
    const save = await offline.request('/api/v1/library/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ games: [game] }),
    })
    expect(save.status).toBe(503)
  })
})

describe('GET /api/v1/sources/{source}/users/{username}/history', () => {
  it('pages through a history and checks cursor and time', async () => {
    const first = await (await app.request('/api/v1/sources/chesscom/users/8sly/history')).json()
    expect(first).toMatchObject({ next: '2:2026/09', progress: { done: 1, total: 2 } })
    const second = await app.request(
      '/api/v1/sources/chesscom/users/8sly/history?cursor=2:2026/09&since=2026-01-01T00:00:00.000Z',
    )
    expect(await second.json()).toMatchObject({ progress: { done: 2, total: 2 } })
    expect((await app.request('/api/v1/sources/chesscom/users/8sly/history?cursor=x')).status).toBe(
      400,
    )
    expect(
      (await app.request('/api/v1/sources/chesscom/users/8sly/history?since=yesterday')).status,
    ).toBe(400)
    expect((await app.request('/api/v1/sources/chesscom/users/ghost/history')).status).toBe(404)
  })
})

describe('profile and players', () => {
  it('looks up a player and reports unknown ones', async () => {
    const res = await app.request('/api/v1/sources/chesscom/users/8sly')
    expect(await res.json()).toMatchObject({
      player: { username: '8sly', ratings: { rapid: 780 } },
    })
    expect((await app.request('/api/v1/sources/chesscom/users/ghost')).status).toBe(404)
    expect((await app.request('/api/v1/sources/chesscom/users/a%20b')).status).toBe(400)
  })

  it('keeps the profile: none at first, then the latest saved', async () => {
    await library.status()
    expect(await (await app.request('/api/v1/profile')).json()).toEqual({ profile: null })
    const profile = {
      id: 'p1',
      displayName: '8sly',
      accounts: [{ source: 'chesscom', username: '8sly' }],
      createdAt: '2026-11-03T21:00:00.000Z',
      updatedAt: '2026-11-03T21:00:00.000Z',
    }
    const put = (body: unknown) =>
      app.request('/api/v1/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    expect((await put({ profile })).status).toBe(200)
    expect(
      (
        await put({
          profile: { ...profile, displayName: 'Sly', updatedAt: '2026-11-03T22:00:00.000Z' },
        })
      ).status,
    ).toBe(200)
    expect(await (await app.request('/api/v1/profile')).json()).toMatchObject({
      profile: { id: 'p1', displayName: 'Sly' },
    })
    const twice = {
      ...profile,
      accounts: [...profile.accounts, { source: 'chesscom', username: 'x2' }],
    }
    expect((await put({ profile: twice })).status).toBe(400)
  })
})

describe('review queue routes', () => {
  const start = (body: unknown) =>
    app.request('/api/v1/library/review-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('starts, pauses, resumes and reports a run', async () => {
    expect(await (await app.request('/api/v1/library/review-queue')).json()).toMatchObject({
      status: 'idle',
    })
    expect(await (await start({ count: 30, speed: 'rapid' })).json()).toMatchObject({
      status: 'running',
      total: 30,
    })
    const post = (path: string) =>
      app.request(`/api/v1/library/review-queue/${path}`, { method: 'POST' })
    expect(await (await post('pause')).json()).toMatchObject({ status: 'paused', done: 3 })
    expect(await (await post('resume')).json()).toMatchObject({ status: 'running' })
  })

  it('refuses bad requests, a second run, and running without a database', async () => {
    expect((await start({ count: 0 })).status).toBe(400)
    expect((await start({ count: 30, speed: 'unlimited' })).status).toBe(400)
    expect((await start({ count: 13 })).status).toBe(409)
    expect((await start({ count: 14 })).status).toBe(503)
  })
})

describe('coach routes', () => {
  const ask = (body: unknown) =>
    app.request('/api/v1/coach/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const conversationId = '0b7e5f8a-6a5c-4d3e-9c1b-2a4f6e8d0c11'

  it('lists the agents', async () => {
    const res = await app.request('/api/v1/coach')
    expect(await res.json()).toEqual({
      agents: [{ id: 'scripted', label: 'Scripted coach', available: true }],
    })
  })

  it('streams the answer as server-sent events, tools included', async () => {
    const res = await ask({
      conversationId,
      question: 'Who is better?',
      context: { fen: START_FEN },
    })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const events = (await res.text())
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)) as { type: string; delta?: string; name?: string })
    // The answer streams word by word; around the pieces: the tool, then the end.
    expect(events.map((e) => e.type).filter((type) => type !== 'text')).toEqual([
      'tool',
      'tool_result',
      'done',
    ])
    expect(events[0]!.type).toBe('text')
    expect(events.filter((e) => !CoachEventSchema.safeParse(e).success)).toEqual([])
    expect(
      events
        .filter((e) => e.type === 'text')
        .map((e) => e.delta)
        .join(''),
    ).toBe('Let me look. Both sides are equal.')
    // The tool result the model got came from the engine, in SAN.
    const toolTurn = coachModel.requests[1]!.messages[2] as { results: { content: string }[] }
    expect(JSON.parse(toolTurn.results[0]!.content)).toMatchObject({ sideToMove: 'white' })
  })

  it('rejects bad questions and unknown agents', async () => {
    expect((await ask({ conversationId, question: '' })).status).toBe(400)
    expect((await ask({ conversationId: 'x', question: 'Hi' })).status).toBe(400)
    expect((await ask({ conversationId, question: 'Hi', agent: 'gpt' })).status).toBe(404)
  })

  describe('comments on a move', () => {
    const post = (target: typeof app, body: unknown) =>
      target.request('/api/v1/coach/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    const move = {
      fen: START_FEN,
      color: 'white',
      moveNumber: 12,
      san: 'Qxb7',
      verdict: 'blunder',
      winBefore: 60,
      winAfter: 12,
      hanging: { piece: 'queen', square: 'b7', pawns: 9 },
    }
    /** An app whose only agent has the engine tool and a model that wants to use it. */
    const appWith = (client: ReturnType<typeof scriptedClient>['client']) =>
      createApp({
        engine,
        humanMoves,
        library,
        reviewQueue,
        coach: {
          agents: () => [
            new LoopAgent({
              id: 'scripted',
              label: 'Scripted coach',
              client,
              tools: [evaluatePositionTool(engine)],
              conversations: new InMemoryConversationStore(),
            }),
          ],
        },
        settings,
        version: '9.9.9',
        startedAt: 0,
        sources: {
          lichess: fakeSource('lichess', () => []),
          chesscom: fakeSource('chesscom', () => []),
        },
      })

    it('answers from the move alone: no tools, and anything else sent never gets through', async () => {
      const model = scriptedClient([{ text: 'That gave up your queen.' }])
      const res = await post(appWith(model.client), {
        ...move,
        best: 'Nf3',
        line: ['Nf3', 'Nc6'],
        question: 'What should I play?',
        pgn: '1. e4 *',
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ text: 'That gave up your queen.' })
      expect(model.requests).toHaveLength(1)
      expect(model.requests[0]!.tools).toEqual([])
      const sent = JSON.stringify(model.requests[0]!.messages)
      expect(sent).toContain('12. Qxb7')
      expect(sent).toContain('My queen on b7 can now be won')
      for (const hidden of ['Nf3', 'Nc6', 'What should I play', '1. e4']) {
        expect(sent).not.toContain(hidden)
      }
    })

    it('fails plainly when the model calls a tool anyway', async () => {
      const model = scriptedClient([
        { toolCalls: [{ name: 'evaluate_position', input: { fen: START_FEN } }] },
        { text: 'Play Nf3.' },
      ])
      expect((await post(appWith(model.client), move)).status).toBe(502)
      expect(model.requests).toHaveLength(1)
    })

    it('rejects bad facts and unknown agents', async () => {
      const { client } = scriptedClient([])
      const target = appWith(client)
      expect((await post(target, { ...move, verdict: 'best' })).status).toBe(400)
      expect((await post(target, { ...move, san: undefined })).status).toBe(400)
      expect((await post(target, { ...move, agent: 'gpt' })).status).toBe(404)
    })
  })
})

describe('settings routes', () => {
  const local = { Host: 'localhost:3000' }
  const put = (body: unknown, headers: Record<string, string> = local) =>
    app.request('/api/v1/settings/coach', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

  it('shows the coach settings, keys only as a hint', async () => {
    const res = await app.request('/api/v1/settings/coach', { headers: local })
    const view = (await res.json()) as { claudeApi: { apiKey: unknown } }
    expect(view.claudeApi.apiKey).toEqual({ set: true, hint: 'sk-ant-…envk', source: 'env' })
  })

  it('keeps a new key in the settings file and never sends it back', async () => {
    const key = 'sk-ant-api03-page-entered-key-wxyz'
    const res = await put({ claudeApi: { apiKey: key, effort: 'high' }, ollama: { enabled: true } })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('page-entered')
    expect(JSON.parse(text)).toMatchObject({
      claudeApi: {
        effort: 'high',
        apiKey: { set: true, hint: 'sk-ant-…wxyz', source: 'settings' },
      },
      ollama: { enabled: true },
    })
    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toMatchObject({
      coach: { claudeApi: { apiKey: key } },
    })
    expect(settingsRegistry.agents().map((a) => a.id)).toContain('ollama')

    const removed = await put({ claudeApi: { apiKey: null } })
    expect(
      ((await removed.json()) as { claudeApi: { apiKey: { source: string } } }).claudeApi.apiKey
        .source,
    ).toBe('env')
    expect((await put({ claudeApi: { effort: 'extreme' } })).status).toBe(400)
  })

  it('answers only requests to this machine', async () => {
    expect(
      (await app.request('/api/v1/settings/coach', { headers: { Host: 'evil.example' } })).status,
    ).toBe(403)
    expect((await app.request('/api/v1/settings/coach')).status).toBe(403) // no Host at all
    expect((await put({ ollama: { enabled: false } }, { Host: 'evil.example:3000' })).status).toBe(
      403,
    )
  })
})

describe('local host names only', () => {
  it('turns away requests addressed to another name (DNS rebinding)', async () => {
    const guarded = createApp({
      engine,
      humanMoves,
      library: new DatabaseLibraryService(undefined),
      reviewQueue,
      coach: { agents: () => [] },
      settings,
      version: '9.9.9',
      startedAt: 0,
      sources: {
        lichess: fakeSource('lichess', () => []),
        chesscom: fakeSource('chesscom', () => []),
      },
      localHostNamesOnly: true,
    })
    const health = (host: string) => guarded.request('/api/v1/health', { headers: { Host: host } })
    expect((await health('localhost:5173')).status).toBe(200)
    expect((await health('127.0.0.1:3000')).status).toBe(200)
    expect((await health('[::1]:3000')).status).toBe(200)
    expect((await health('rebind.attacker.example:3000')).status).toBe(403)
  })
})
