import {
  GameNotFoundError,
  SourceUnavailableError,
  UserNotFoundError,
  type GameSource,
  type SourceGame,
} from '@pawnia/library'
import { buildBookData, createOpeningBook, type ReviewedMove } from '@pawnia/analysis'
import { CoachEventSchema, type TrainingResultBody } from '@pawnia/contracts'
import { InMemoryConversationStore, LoopAgent } from '@pawnia/coach'
import { scriptedClient } from '@pawnia/coach/testing'
import { sampleReview } from '@pawnia/history/testing'
import { sampleGame, sampleSourceGame } from '@pawnia/library/testing'
import { beforeAll, describe, expect, it } from 'vitest'
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CoachRegistry } from './adapters/coach/agents'
import { evaluatePositionTool } from './adapters/coach/tools/evaluatePosition'
import { FileSettingsService } from './adapters/settings/fileSettingsService'
import { FileSettingsStore } from './adapters/settings/fileSettingsStore'
import { loadConfig } from './config'
import { openDatabase } from './adapters/db/database'
import { DatabaseLibraryService } from './adapters/db/service'
import type { EngineService, EngineStatus } from './adapters/engine/service'
import {
  IllegalTryError,
  NoStoredReviewError,
  type WalkthroughService,
} from './adapters/coach/walkthroughService'
import type { HumanMoveService, HumanMovesStatus } from './adapters/humanMoves/service'
import { ReviewQueueBusyError, type ReviewQueueService } from './adapters/review/reviewQueueService'
import { FileOpeningLibrary, libraryFile } from './adapters/library/openingLibrary'
import { OpeningGuides } from './adapters/library/openingGuides'
import { FilePuzzleLibrary } from './adapters/puzzles/filePuzzleLibrary'
import { StoredRepertoire } from './adapters/repertoire/storedRepertoire'
import { OpeningPractice } from './adapters/openings/practice'
import { StoredOpenings } from './adapters/openings/storedOpenings'
import { LiveStats } from './adapters/stats/liveStats'
import type { TrainingService } from './adapters/training/trainingService'
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
const settingsPath = join(mkdtempSync(join(tmpdir(), 'pawnia-app-test-')), 'settings.json')
const settingsRegistry = new CoachRegistry([], {
  baseUrl: 'http://127.0.0.1:3000',
  version: 'test',
})
const settings = new FileSettingsService(
  loadConfig({ ANTHROPIC_API_KEY: 'sk-ant-from-env-0000000000-envk' }),
  new FileSettingsStore(settingsPath),
  settingsRegistry,
)
/** Answers like the real one; its work has tests of its own. */
const results: TrainingResultBody[] = []
const training: TrainingService = {
  training: async () => ({ due: [], waiting: 2, solved: 1 }),
  record: async (result) => {
    if (result.ply === 99) throw new Error('No database configured (DATABASE_URL)')
    results.push(result)
  },
}

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

const WALKTHROUGH = {
  summary: 'You won.',
  moments: [],
  focus: 'Keep going.',
  agent: 'Scripted coach',
  writtenAt: '2026-11-06T12:00:00.000Z',
}
/** Answers like the real one; its work has tests of its own. */
const walkthroughs: WalkthroughService = {
  find: async ({ startFen, moves }) => {
    if (startFen === 'unreviewed') throw new NoStoredReviewError()
    if (startFen === 'no-database') throw new Error('No database configured (DATABASE_URL)')
    return moves[0] === 'e2e4' ? WALKTHROUGH : undefined
  },
  write: async (_request, agent) => ({ ...WALKTHROUGH, summary: 'Written.', agent: agent.label }),
  judge: async ({ startFen, tried }, agent) => {
    if (startFen === 'unreviewed') throw new NoStoredReviewError()
    if (tried === 'a1a8') throw new IllegalTryError(tried)
    if (startFen === 'no-engine') throw new Error('no engine on this server')
    return { verdict: 'wrong', san: 'Nf3', fen: 'after', comment: `From ${agent?.label}` }
  },
}

/** Theory for the openings routes: the Vienna's first moves. */
const smallBook = createOpeningBook(
  buildBookData([{ eco: 'C25', name: 'Vienna Game', pgn: '1. e4 e5 2. Nc3' }]),
)

/** The checked-in library file. */
const libraryData = libraryFile(
  fileURLToPath(new URL('../data/opening-library.json', import.meta.url)),
)
const openingLibrary = new FileOpeningLibrary(libraryData)
const guides = new OpeningGuides(libraryData, library)
/** The checked-in sample of the puzzle set; of the puzzles that fit, always the first. */
const puzzles = new FilePuzzleLibrary(
  fileURLToPath(new URL('../data/puzzle-sample.json', import.meta.url)),
  () => 0,
)
const repertoire = new StoredRepertoire(library, () => new Date('2026-11-11T12:00:00.000Z'))

/** Practice against the small book, with a reviewer that calls every move off theory a mistake. */
const practice = new OpeningPractice(
  async () => smallBook,
  async (input) => ({
    startFen: input.startFen,
    positions: [],
    moves: [
      {
        ply: 1,
        moveNumber: 1,
        color: 'white',
        san: 'x',
        uci: input.moves[0]!,
        winBefore: 50,
        winAfter: 30,
        accuracy: 40,
        classification: 'mistake',
        facts: {} as ReviewedMove['facts'],
        best: { uci: 'b1c3', san: 'Nc3', line: ['b1c3', 'g8f6'] },
      },
    ],
    accuracy: {},
    counts: { white: {}, black: {} },
    settings: { engine: 'test', nodes: 1 },
  }),
)

const sources = {
  lichess: fakeSource('lichess', (username, max) => {
    requests.push({ username, max })
    if (username === 'ghost') throw new UserNotFoundError('lichess', username)
    if (username === 'busy') throw new SourceUnavailableError('lichess', 'rate limited', 60)
    if (username === 'down') throw new SourceUnavailableError('lichess', 'HTTP 503')
    return games.slice(0, max)
  }),
  chesscom: fakeSource('chesscom', () => []),
}

const app = createApp({
  engine,
  humanMoves,
  library,
  reviewQueue,
  training,
  coach: { agents: () => coach },
  walkthroughs,
  settings,
  version: '9.9.9',
  startedAt: 1_000,
  now: () => 61_000,
  sources,
  stats: new LiveStats({ library, sources }),
  openings: new StoredOpenings(library, async () => smallBook),
  practice,
  openingLibrary,
  guides,
  puzzles,
  repertoire,
})

describe('api', () => {
  it('GET /api/v1/health', async () => {
    const res = await app.request('/api/v1/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'ok',
      service: 'pawnia-api',
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
      '/coach/tries',
      '/coach/walkthroughs',
      '/engine',
      '/engine/evaluations',
      '/health',
      '/human-moves',
      '/human-moves/predict',
      '/human-moves/probabilities',
      '/library',
      '/library/games',
      '/library/games/missing',
      '/library/games/{id}',
      '/library/review-queue',
      '/library/review-queue/pause',
      '/library/review-queue/resume',
      '/library/reviews',
      '/library/reviews/find',
      '/opening-library',
      '/opening-library/position',
      '/opening-library/{id}',
      '/opening-library/{id}/guide',
      '/opening-library/{id}/line-notes',
      '/profile',
      '/puzzles',
      '/puzzles/next',
      '/puzzles/{id}',
      '/repertoire',
      '/repertoire/{id}',
      '/repertoire/{id}/reviews',
      '/settings/coach',
      '/sources/{source}/games/{id}',
      '/sources/{source}/users/{username}',
      '/sources/{source}/users/{username}/games',
      '/sources/{source}/users/{username}/history',
      '/stats/me',
      '/stats/players/{source}/{username}',
      '/training',
      '/training/openings',
      '/training/openings/practice',
      '/training/openings/{color}',
      '/training/results',
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
    // A body that isn't sent as JSON is turned away before it is read: a page of another site
    // can post plain text without the browser asking first.
    const plain = await app.request('/api/v1/engine/evaluations', {
      method: 'POST',
      body: JSON.stringify({ fens: [START], nodes: 5_000_000 }),
    })
    expect(plain.status).toBe(415)
    const notJson = await app.request('/api/v1/engine/evaluations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x',
    })
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

  it('removes a game the user deleted, and doesn’t mind one it never had', async () => {
    const gone = sampleGame({ id: 'lib-gone', externalId: 'lib-ext-gone' })
    expect((await post('/games', { games: [gone] })).status).toBe(200)
    const remove = (id: string) => app.request(`/api/v1/library/games/${id}`, { method: 'DELETE' })
    expect(await (await remove('lib-gone')).json()).toEqual({ deleted: true })
    const missing = await post('/games/missing', { ids: ['lib-gone'] })
    expect(await missing.json()).toEqual({ missing: ['lib-gone'] })
    expect((await remove('lib-never')).status).toBe(200)
  })

  it('rejects unreadable PGNs', async () => {
    const broken = await post('/games', { games: [{ ...game, id: 'lib-3', pgn: '1. e5 e4' }] })
    expect(broken.status).toBe(400)
  })

  it('keeps a platform game once: sent under a second id, it answers with the id it keeps', async () => {
    const fresh = sampleGame({ id: 'lib-5', externalId: 'lib-ext-5' })
    const res = await post('/games', { games: [{ ...game, id: 'lib-4' }, fresh] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ stored: 1, renamed: [{ id: 'lib-4', as: 'lib-1' }] })
    const missing = await post('/games/missing', { ids: ['lib-1', 'lib-4', 'lib-5'] })
    expect(await missing.json()).toEqual({ missing: ['lib-4'] })
  })

  it('keeps a review of a line, and only of the moves it was sent with', async () => {
    const { line, review } = sampleReview()
    const ok = await post('/reviews', { ...line, review })
    expect(ok.status).toBe(200)
    expect(await (await app.request('/api/v1/library')).json()).toMatchObject({ reviews: 1 })
    const other = await post('/reviews', { ...line, moves: ['d2d4', 'd7d5'], review })
    expect(other.status).toBe(400)
  })

  it('finds the review of exactly the line asked for, as it was sent', async () => {
    const { line, review } = sampleReview({
      startFen: sampleReview().line.startFen,
      moves: ['g1f3', 'g8f6'],
    })
    await post('/reviews', { ...line, review })

    const found = await post('/reviews/find', line)
    expect(found.status).toBe(200)
    expect(await found.json()).toEqual({ review, reviewedAt: expect.any(String) })

    const shorter = await post('/reviews/find', { ...line, moves: ['g1f3'] })
    expect(shorter.status).toBe(404)
    const otherStart = await post('/reviews/find', {
      ...line,
      startFen: '8/8/8/8/8/8/8/K1k5 w - - 0 1',
    })
    expect(otherStart.status).toBe(404)
    const notMoves = await post('/reviews/find', { ...line, moves: ['Nf3'] })
    expect(notMoves.status).toBe(400)
  })

  it('answers 503 without a database', async () => {
    const offline = createApp({
      engine,
      humanMoves,
      library: new DatabaseLibraryService(undefined),
      reviewQueue,
      training,
      stats: new LiveStats({ library: new DatabaseLibraryService(undefined), sources }),
      openings: new StoredOpenings(new DatabaseLibraryService(undefined), async () => undefined),
      practice,
      openingLibrary,
      guides,
      puzzles,
      repertoire,
      coach: { agents: () => [] },
      walkthroughs,
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
    const find = await offline.request('/api/v1/library/reviews/find', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleReview().line),
    })
    expect(find.status).toBe(503)
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

describe('coach walkthrough route', () => {
  const ask = (body: unknown) =>
    app.request('/api/v1/coach/walkthroughs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('gives the kept walkthrough, or has the agent write one', async () => {
    expect(await (await ask({ startFen: START_FEN, moves: ['e2e4'] })).json()).toEqual(WALKTHROUGH)
    expect(await (await ask({ startFen: START_FEN, moves: ['d2d4'] })).json()).toMatchObject({
      summary: 'Written.',
      agent: 'Scripted coach',
    })
    const again = await ask({ startFen: START_FEN, moves: ['e2e4'], regenerate: true })
    expect(await again.json()).toMatchObject({ summary: 'Written.' })
  })

  it('says what is missing', async () => {
    expect((await ask({ startFen: 'unreviewed', moves: ['e2e4'] })).status).toBe(404)
    expect((await ask({ startFen: 'no-database', moves: ['e2e4'] })).status).toBe(503)
    expect((await ask({ startFen: START_FEN, moves: [] })).status).toBe(400)
    expect((await ask({ startFen: START_FEN, moves: ['d2d4'], agent: 'nope' })).status).toBe(404)
  })
})

describe('coach try route', () => {
  const ask = (body: object) =>
    app.request('/api/v1/coach/tries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startFen: START_FEN,
        moves: ['e2e4'],
        ply: 1,
        tried: 'g1f3',
        ...body,
      }),
    })

  it('judges a try, with a word from the coach', async () => {
    expect(await (await ask({})).json()).toEqual({
      verdict: 'wrong',
      san: 'Nf3',
      fen: 'after',
      comment: 'From Scripted coach',
    })
  })

  it('says what stands in the way', async () => {
    expect((await ask({ startFen: 'unreviewed' })).status).toBe(404)
    expect((await ask({ tried: 'a1a8' })).status).toBe(400)
    expect((await ask({ startFen: 'no-engine' })).status).toBe(503)
    expect((await ask({ ply: 0 })).status).toBe(400)
  })
})

describe('training routes', () => {
  const send = (ply: number) =>
    app.request('/api/v1/training/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startFen: START_FEN, moves: ['e2e4'], ply, solvedFirstTry: true }),
    })

  it('lists the puzzles and keeps results', async () => {
    expect(await (await app.request('/api/v1/training')).json()).toEqual({
      due: [],
      waiting: 2,
      solved: 1,
    })
    expect((await send(1)).status).toBe(200)
    expect(results.at(-1)).toMatchObject({ ply: 1, solvedFirstTry: true })
  })

  it('needs the history', async () => {
    expect((await send(99)).status).toBe(503)
  })
})

describe('stats routes', () => {
  it('counts the user’s own games from the stored history', async () => {
    const res = await app.request('/api/v1/stats/me?tz=Europe/Berlin&speed=blitz')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      player: { kind: 'me' },
      window: { last: 30, speed: 'blitz' },
      activity: { timeZone: 'Europe/Berlin' },
    })
  })

  it('looks anyone up on a platform, reading their history', async () => {
    const res = await app.request('/api/v1/stats/players/lichess/alice?last=5')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { repertoire: { white: unknown[] } }
    expect(body).toMatchObject({
      player: { kind: 'lookup', profile: { username: 'alice' } },
      window: { last: 5, found: 2, more: false },
      record: { games: 2, wins: 2 },
      endings: { wins: [{ reason: 'checkmate', games: 2 }] },
    })
    expect(body.repertoire.white[0]).toMatchObject({ moves: ['e4'], tally: { games: 2 } })
    expect(body).not.toHaveProperty('quality')
  })

  it('answers 404 for an unknown player and 400 for a bad query', async () => {
    expect((await app.request('/api/v1/stats/players/lichess/ghost')).status).toBe(404)
    expect((await app.request('/api/v1/stats/me?tz=Mars/Olympus')).status).toBe(400)
    expect((await app.request('/api/v1/stats/me?last=301')).status).toBe(400)
  })
})

describe('opening routes', () => {
  it('lists the user’s openings and answers 404 for one they never played', async () => {
    const list = await app.request('/api/v1/training/openings?last=300')
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject({ window: { last: 300 }, openings: [] })
    const none = await app.request('/api/v1/training/openings/white?family=Nowhere%20Gambit')
    expect(none.status).toBe(404)
    expect((await app.request('/api/v1/training/openings/green?family=x')).status).toBe(400)
  })

  it('judges practice moves: theory first, then the review', async () => {
    const check = (moves: string[], tried: string) =>
      app.request('/api/v1/training/openings/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves, tried }),
      })
    const theory = await check(['e2e4', 'e7e5'], 'b1c3')
    expect(await theory.json()).toMatchObject({
      verdict: 'theory',
      san: 'Nc3',
      theory: [{ san: 'Nc3', uci: 'b1c3' }],
      replies: [],
    })
    const off = await check(['e2e4', 'e7e5'], 'h2h3')
    expect(await off.json()).toMatchObject({
      verdict: 'wrong',
      san: 'h3',
      best: { san: 'Nc3', uci: 'b1c3', line: '2. Nc3 Nf6' },
    })
    expect((await check(['e2e4', 'e2e4'], 'b1c3')).status).toBe(400)
    expect((await check(['e2e4'], 'a1a8')).status).toBe(400)
  })
})

describe('opening library routes', () => {
  it('lists the openings for White and Black, with tags and trap counts', async () => {
    const res = await app.request('/api/v1/opening-library')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { openings: { id: string; side: string; traps: number }[] }
    expect(body.openings.find((o) => o.id === 'italian')).toMatchObject({ side: 'white' })
    expect(body.openings.find((o) => o.id === 'caro-kann')).toMatchObject({ side: 'black' })
    expect(body.openings.find((o) => o.id === 'italian')!.traps).toBeGreaterThan(0)
  })

  it('shows one opening with its tree and traps, and what is played in a position', async () => {
    const italian = (await (await app.request('/api/v1/opening-library/italian')).json()) as {
      tree: { moves: string[]; name?: string }[]
      traps: { bait: string; yours: boolean }[]
    }
    expect(italian.tree.some((n) => n.name === 'Italian Game')).toBe(true)
    expect(italian.traps.find((t) => t.bait === 'Ke8')).toMatchObject({ yours: true })
    const position = await app.request('/api/v1/opening-library/position?moves=e4,c6')
    expect(position.status).toBe(200)
    expect(((await position.json()) as { moves: { san: string }[] }).moves[0]?.san).toBe('d4')
    expect((await app.request('/api/v1/opening-library/nope')).status).toBe(404)
    expect((await app.request('/api/v1/opening-library/position?moves=h4,h5,h3')).status).toBe(404)
  })
})

describe('puzzle routes', () => {
  const next = (body: unknown, target = app) =>
    target.request('/api/v1/puzzles/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('tells where the puzzles come from and lists the themes with their sizes', async () => {
    const res = await app.request('/api/v1/puzzles')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      source: Record<string, unknown>
      puzzles: number
      themes: { theme: string; kind: string; puzzles: number }[]
    }
    expect(body.source).toMatchObject({
      url: 'https://database.lichess.org/lichess_db_puzzle.csv.zst',
      license: 'CC0-1.0',
      filter: { minPopularity: 85, minPlays: 500, maxRatingDeviation: 90, ratingBelow: 2200 },
    })
    expect(body.puzzles).toBe(56)
    expect(body.themes[0]).toEqual({ theme: 'endgame', kind: 'phase', puzzles: 31 })
    expect(body.themes.find((t) => t.theme === 'fork')).toEqual({
      theme: 'fork',
      kind: 'motif',
      puzzles: 8,
    })
    expect(body.themes.find((t) => t.theme === 'mateIn2')?.kind).toBe('mate')
  })

  it('hands out a puzzle of a wanted theme near the rating, ready to solve', async () => {
    const res = await next({ themes: ['fork'], rating: 1500 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: '000Pw',
      url: 'https://lichess.org/training/000Pw',
      // After the opponent's Nd2: lichess' row has the position before it.
      fen: '6k1/5p1p/4p3/4q3/3n4/2Q3P1/PP1N1P1P/6K1 b - - 3 37',
      opponentMove: 'e4d2',
      color: 'black',
      solution: ['d4e2', 'g1f1', 'e2c3'],
      rating: 1514,
      themes: ['crushing', 'endgame', 'fork', 'short'],
      theme: 'fork',
    })
  })

  it('leaves out the given ids, and says when nothing is left', async () => {
    const second = (await (
      await next({ themes: ['fork'], rating: 1500, exclude: ['000Pw'] })
    ).json()) as { id: string; rating: number }
    expect(second).toMatchObject({ id: '00761', rating: 1379 })
    const underPromotion = await next({ themes: ['underPromotion'], rating: 900 })
    expect(await underPromotion.json()).toMatchObject({ id: '09fof', rating: 2130 })
    const none = await next({ themes: ['underPromotion'], exclude: ['09fof'] })
    expect(none.status).toBe(404)
    expect(await none.json()).toMatchObject({
      title: 'No puzzle left',
      detail: 'The library has no puzzle of underPromotion besides the 1 excluded',
    })
    const unknown = await next({ themes: ['noSuchTheme', 'norThis'] })
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toMatchObject({
      detail: 'The library has no puzzle of noSuchTheme, norThis',
    })
  })

  it('hands out any puzzle near 1500 when nothing is asked for', async () => {
    const res = await next({})
    expect(res.status).toBe(200)
    const body = (await res.json()) as { rating: number; theme?: string }
    expect(Math.abs(body.rating - 1500)).toBeLessThanOrEqual(50)
    expect(body.theme).toBeUndefined()
  })

  it('finds a puzzle by its id', async () => {
    const res = await app.request('/api/v1/puzzles/09fof')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: '09fof',
      color: 'black',
      solution: ['d3d2', 'd4c3', 'd2d1n'],
    })
    expect((await app.request('/api/v1/puzzles/zzzzz')).status).toBe(404)
    expect((await app.request('/api/v1/puzzles/no%20way')).status).toBe(400)
  })

  it('rejects a request that makes no sense', async () => {
    expect((await next({ themes: ['fork!'] })).status).toBe(400)
    expect((await next({ rating: 'high' })).status).toBe(400)
    expect((await next({ exclude: ['../etc'] })).status).toBe(400)
  })

  it('answers 503 until the puzzles are fetched, and the rest of the API works', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pawnia-puzzles-'))
    const path = join(folder, 'puzzles.json')
    const unfetched = createApp({
      engine,
      humanMoves,
      library,
      reviewQueue,
      training,
      coach: { agents: () => [] },
      walkthroughs,
      settings,
      version: '9.9.9',
      startedAt: 0,
      sources,
      stats: new LiveStats({ library, sources }),
      openings: new StoredOpenings(library, async () => smallBook),
      practice,
      openingLibrary,
      guides,
      puzzles: new FilePuzzleLibrary(path),
      repertoire,
    })
    expect((await unfetched.request('/api/v1/health')).status).toBe(200)
    const list = await unfetched.request('/api/v1/puzzles')
    expect(list.status).toBe(503)
    expect(list.headers.get('content-type')).toContain('application/problem+json')
    expect(await list.json()).toMatchObject({
      title: 'No puzzles',
      detail: `No puzzle set at ${path} (no such file). Fetch it with: bun run --cwd apps/api puzzles:fetch`,
    })
    expect((await next({}, unfetched)).status).toBe(503)
    expect((await unfetched.request('/api/v1/puzzles/000Pw')).status).toBe(503)

    // Once the file is there the routes answer, without a restart.
    copyFileSync(fileURLToPath(new URL('../data/puzzle-sample.json', import.meta.url)), path)
    expect((await unfetched.request('/api/v1/puzzles/000Pw')).status).toBe(200)
  })
})

describe('opening guide routes', () => {
  /** An app whose only coach answers with these texts, one per request. */
  const makeGuideApp = (replies: string[]) => {
    const { client, requests } = scriptedClient(replies.map((text) => ({ text })))
    const agent = new LoopAgent({
      id: 'scripted',
      label: 'Scripted coach',
      client,
      tools: [],
      conversations: new InMemoryConversationStore(),
    })
    const target = createApp({
      engine,
      humanMoves,
      library,
      reviewQueue,
      training,
      coach: { agents: () => [agent] },
      walkthroughs,
      settings,
      version: '9.9.9',
      startedAt: 1_000,
      sources,
      stats: new LiveStats({ library, sources }),
      openings: new StoredOpenings(library, async () => smallBook),
      practice,
      openingLibrary,
      guides,
      puzzles,
      repertoire,
    })
    return { guideApp: target, requests }
  }
  const write = (target: ReturnType<typeof createApp>, id: string, body = {}) =>
    target.request(`/api/v1/opening-library/${id}/guide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('writes a guide from the library’s facts once, keeps it, and writes again on request', async () => {
    const facts = await guides.facts('scotch')
    expect(facts?.line[0]).toMatchObject({ ply: 1, move: '1.e4' })
    expect(facts?.line[1]).toMatchObject({ ply: 2, move: '1...e5' })
    // The coach draws on the position after each move; what can't be drawn there is left out.
    expect(facts?.line[0]?.fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
    const draws: Record<number, object> = {
      1: { arrows: [{ from: 'e4', to: 'd5', color: 'green' }], squares: [] },
      2: { arrows: [{ from: 'e6', to: 'e5', color: 'red' }] },
    }
    const guide = (story: string) =>
      JSON.stringify({
        story,
        ideas: 'Open the centre early.',
        opponents: 'Most take on d4.',
        moves: facts!.line.map(({ ply }) => ({ ply, note: `Move ${ply}.`, draw: draws[ply] })),
      })
    const { guideApp, requests } = makeGuideApp([
      guide('Named after a match by Edinburgh.'),
      guide('Again.'),
    ])
    expect((await guideApp.request('/api/v1/opening-library/scotch/guide')).status).toBe(404)

    const first = await write(guideApp, 'scotch')
    expect(first.status).toBe(200)
    const body = (await first.json()) as {
      story: string
      moves: { ply: number; san: string; draw?: object }[]
    }
    expect(body.story).toBe('Named after a match by Edinburgh.')
    expect(body.moves.slice(0, 3).map((m) => m.draw)).toEqual([draws[1], undefined, undefined])
    expect(body.moves.slice(0, 5).map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'd4'])
    // The facts went to the coach, without tools.
    expect(JSON.stringify(requests[0])).toContain('Scotch Game')

    expect(await (await write(guideApp, 'scotch')).json()).toMatchObject({ story: body.story })
    expect(requests).toHaveLength(1)
    const kept = await guideApp.request('/api/v1/opening-library/scotch/guide')
    expect(await kept.json()).toMatchObject({ agent: 'Scripted coach' })
    expect(await (await write(guideApp, 'scotch', { regenerate: true })).json()).toMatchObject({
      story: 'Again.',
    })
  })

  it('writes a guide once when it is asked for twice at the same time', async () => {
    const facts = await guides.facts('danish')
    const text = JSON.stringify({
      story: 'A story.',
      ideas: 'Ideas.',
      opponents: 'Opponents.',
      moves: facts!.line.map(({ ply }) => ({ ply, note: `Move ${ply}.` })),
    })
    const { guideApp, requests } = makeGuideApp([text, text])
    const [first, second] = await Promise.all([
      write(guideApp, 'danish', { regenerate: true }),
      write(guideApp, 'danish', { regenerate: true }),
    ])
    expect([first.status, second.status]).toEqual([200, 200])
    expect(await first.json()).toEqual(await second.json())
    expect(requests).toHaveLength(1)
  })

  it('answers 404 for an unknown opening and 502 for an unusable answer', async () => {
    const { guideApp } = makeGuideApp(['no json', 'still no json'])
    expect((await write(guideApp, 'nowhere')).status).toBe(404)
    expect((await write(guideApp, 'dutch')).status).toBe(502)
  })

  const writeLine = (target: ReturnType<typeof createApp>, id: string, body: object) =>
    target.request(`/api/v1/opening-library/${id}/line-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('writes notes on one line from the library’s facts about it, and keeps them per line', async () => {
    const line = ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4']
    const facts = await guides.lineFacts('scotch', line)
    expect(facts).toMatchObject({ opening: 'Scotch Game', side: 'white' })
    expect(facts?.variation).toContain('Scotch Game')
    expect(facts?.line.map((m) => m.move)).toEqual([
      '1.e4',
      '1...e5',
      '2.Nf3',
      '2...Nc6',
      '3.d4',
      '3...exd4',
    ])
    // How often each move is played where the library has games, and the score at the end.
    expect(facts?.line[5]?.share).toBeGreaterThan(50)
    expect(facts?.score).toBeGreaterThan(30)

    const notes = (first: string) =>
      JSON.stringify({
        moves: line.map((_, i) => ({
          ply: i + 1,
          note: i === 0 ? first : `Move ${i + 1}.`,
          ...(i === 4 && { draw: { arrows: [{ from: 'd4', to: 'e5', color: 'green' }] } }),
        })),
      })
    const { guideApp, requests } = makeGuideApp([notes('The centre.'), notes('Again.')])
    const kept = (moves: string) =>
      guideApp.request(`/api/v1/opening-library/scotch/line-notes?moves=${moves}`)
    expect((await kept(line.join(','))).status).toBe(404)

    // Moves may come as the board gives them; they are kept as they are written.
    const first = await writeLine(guideApp, 'scotch', { moves: ['e2e4', ...line.slice(1)] })
    expect(first.status).toBe(200)
    const body = (await first.json()) as {
      moves: { ply: number; san: string; note: string; draw?: object }[]
      agent: string
    }
    expect(body.agent).toBe('Scripted coach')
    expect(body.moves.map((m) => m.san)).toEqual(line)
    expect(body.moves[4]?.draw).toEqual({
      arrows: [{ from: 'd4', to: 'e5', color: 'green' }],
      squares: [],
    })
    expect(JSON.stringify(requests[0])).toContain('3...exd4')

    // Kept: asked again, the coach isn't; another line has none; on request it writes again.
    expect(await (await writeLine(guideApp, 'scotch', { moves: line })).json()).toEqual(body)
    expect(requests).toHaveLength(1)
    expect(await (await kept(line.join(','))).json()).toEqual(body)
    expect((await kept('e4,e5,Nf3,Nc6,d4')).status).toBe(404)
    const again = await writeLine(guideApp, 'scotch', { moves: line, regenerate: true })
    expect(((await again.json()) as typeof body).moves[0]?.note).toBe('Again.')
  })

  it('answers 400 for a line that cannot be played, 404 for an unknown opening', async () => {
    const { guideApp } = makeGuideApp(['no json', 'still no json'])
    expect((await writeLine(guideApp, 'scotch', { moves: ['e4', 'e4'] })).status).toBe(400)
    expect(
      (await guideApp.request('/api/v1/opening-library/scotch/line-notes?moves=e4,Ke2')).status,
    ).toBe(400)
    expect((await writeLine(guideApp, 'nowhere', { moves: ['e4', 'e5'] })).status).toBe(404)
    expect((await writeLine(guideApp, 'scotch', { moves: ['e4', 'e5'] })).status).toBe(502)
  })
})

describe('repertoire routes', () => {
  const add = (body: object) =>
    app.request('/api/v1/repertoire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('keeps lines, once each, and moves them on as they are reviewed', async () => {
    const res = await add({
      side: 'black',
      title: 'Caro-Kann Defense: Advance Variation',
      moves: ['e4', 'c6', 'd4', 'd5', 'e5'],
      openingId: 'caro-kann',
    })
    expect(res.status).toBe(200)
    const { line } = (await res.json()) as { line: { id: string; due: boolean; level: number } }
    expect(line).toMatchObject({ due: true, level: 0, source: 'library' })
    // The same line in UCI is the same line.
    const again = await add({
      side: 'black',
      title: 'x',
      moves: ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5'],
    })
    expect(((await again.json()) as { line: { id: string } }).line.id).toBe(line.id)

    const review = (passed: boolean) =>
      app.request(`/api/v1/repertoire/${line.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passed }),
      })
    expect(await (await review(true)).json()).toMatchObject({
      line: { level: 1, due: false, inDays: 1 },
    })
    expect(await (await review(false)).json()).toMatchObject({ line: { level: 0, inDays: 1 } })

    const list = (await (await app.request('/api/v1/repertoire')).json()) as {
      lines: { id: string }[]
    }
    expect(list.lines.map((l) => l.id)).toContain(line.id)
    const removed = await app.request(`/api/v1/repertoire/${line.id}`, { method: 'DELETE' })
    expect(removed.status).toBe(200)
    expect((await app.request(`/api/v1/repertoire/${line.id}`, { method: 'DELETE' })).status).toBe(
      404,
    )
  })

  it('refuses an illegal line', async () => {
    expect((await add({ side: 'white', title: 'x', moves: ['e4', 'e4'] })).status).toBe(400)
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
        training,
        stats: new LiveStats({ library, sources }),
        openings: new StoredOpenings(library, async () => smallBook),
        practice,
        openingLibrary,
        guides,
        puzzles,
        repertoire,
        walkthroughs,
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
      training,
      stats: new LiveStats({ library: new DatabaseLibraryService(undefined), sources }),
      openings: new StoredOpenings(new DatabaseLibraryService(undefined), async () => undefined),
      practice,
      openingLibrary,
      guides,
      puzzles,
      repertoire,
      coach: { agents: () => [] },
      walkthroughs,
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

  it('turns away requests sent by a page of another site', async () => {
    const guarded = createApp({
      engine,
      humanMoves,
      library: new DatabaseLibraryService(undefined),
      reviewQueue,
      training,
      stats: new LiveStats({ library: new DatabaseLibraryService(undefined), sources }),
      openings: new StoredOpenings(new DatabaseLibraryService(undefined), async () => undefined),
      practice,
      openingLibrary,
      guides,
      repertoire,
      coach: { agents: () => [] },
      walkthroughs,
      settings,
      version: '9.9.9',
      startedAt: 0,
      sources: {
        lichess: fakeSource('lichess', () => []),
        chesscom: fakeSource('chesscom', () => []),
      },
      localHostNamesOnly: true,
    })
    const pause = (origin?: string) =>
      guarded.request('/api/v1/library/review-queue/pause', {
        method: 'POST',
        headers: { Host: 'localhost:3000', ...(origin !== undefined && { Origin: origin }) },
      })
    // The app's own pages, and callers that are no page at all.
    expect((await pause('http://localhost:5173')).status).not.toBe(403)
    expect((await pause('http://127.0.0.1:5173')).status).not.toBe(403)
    expect((await pause()).status).not.toBe(403)
    // Any other site, also one that hides where it is from.
    expect((await pause('https://evil.example')).status).toBe(403)
    expect((await pause('null')).status).toBe(403)
    const settingsFrom = (origin: string) =>
      guarded.request('/api/v1/settings/coach', {
        headers: { Host: 'localhost:3000', Origin: origin },
      })
    expect((await settingsFrom('https://evil.example')).status).toBe(403)
    expect((await settingsFrom('http://localhost:5173')).status).toBe(200)
  })
})
