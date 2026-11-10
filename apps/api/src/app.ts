import { API_V1_PREFIX } from '@pawnia/contracts'
import type { GameSource, SourceId } from '@pawnia/library'
import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { problem } from './http/problem'
import { createRouter } from './http/router'
import type { CoachDirectory } from './adapters/coach/coachDirectory'
import type { WalkthroughService } from './adapters/coach/walkthroughService'
import type { McpEndpoint } from './adapters/coach/mcpEndpoint'
import type { SettingsService } from './adapters/settings/settingsService'
import { onlyLocalHostNames } from './http/local'
import type { ReviewQueueService } from './adapters/review/reviewQueueService'
import type { OpeningService } from './adapters/openings/openingService'
import type { StatsService } from './adapters/stats/statsService'
import type { TrainingService } from './adapters/training/trainingService'
import type { LibraryService } from './adapters/db/libraryService'
import type { EngineService } from './adapters/engine/service'
import type { HumanMoveService } from './adapters/humanMoves/service'
import { coachRoutes } from './routes/v1/coach'
import { engineRoutes } from './routes/v1/engine'
import { healthRoutes } from './routes/v1/health'
import { humanMoveRoutes } from './routes/v1/humanMoves'
import { libraryRoutes } from './routes/v1/library'
import { reviewQueueRoutes } from './routes/v1/reviewQueue'
import { settingsRoutes } from './routes/v1/settings'
import { sourceRoutes } from './routes/v1/sources'
import { openingRoutes } from './routes/v1/openings'
import { statsRoutes } from './routes/v1/stats'
import { trainingRoutes } from './routes/v1/training'

export interface AppDeps {
  version: string
  startedAt: number
  now?: () => number
  sources: Record<SourceId, GameSource>
  engine: EngineService
  humanMoves: HumanMoveService
  library: LibraryService
  /** Reviews the user's recent games in the background. */
  reviewQueue: ReviewQueueService
  /** Puzzles from the user's own mistakes. */
  training: TrainingService
  /** The stats page: the user's own numbers, and anyone's on a platform. */
  stats: StatsService
  /** The user's openings, for training them. */
  openings: OpeningService
  /** The coach's agents (they follow the settings), the default first; none: the coach is off. */
  coach: CoachDirectory
  /** The coach's walkthroughs of reviewed games. */
  walkthroughs: WalkthroughService
  /** The coach's tools over MCP, for agents that run their own loop. */
  mcp?: McpEndpoint
  /** The settings page's side. */
  settings: SettingsService
  /**
   * Answer only requests addressed to localhost (against DNS rebinding), for an API that listens
   * on this machine only.
   */
  localHostNamesOnly?: boolean
}

/** Builds the HTTP app from its dependencies. main.ts wires real ones, tests wire fakes. */
export function createApp({
  version,
  startedAt,
  now = Date.now,
  sources,
  engine,
  humanMoves,
  library,
  reviewQueue,
  training,
  stats,
  openings,
  coach,
  walkthroughs,
  mcp,
  settings,
  localHostNamesOnly = false,
}: AppDeps) {
  const base = createRouter()
  if (localHostNamesOnly) base.use('*', onlyLocalHostNames())
  // One chain, so the typed client in apps/web sees every route's types.
  const v1 = base
    .route('/', healthRoutes({ version, startedAt, now }))
    .route('/', sourceRoutes({ sources }))
    .route('/', engineRoutes({ engine }))
    .route('/', humanMoveRoutes({ humanMoves }))
    .route('/', libraryRoutes({ library, now }))
    .route('/', reviewQueueRoutes({ reviewQueue }))
    .route('/', trainingRoutes({ training }))
    .route('/', statsRoutes({ stats }))
    .route('/', openingRoutes({ openings }))
    .route('/', coachRoutes({ coach, walkthroughs }))
    .route('/', settingsRoutes({ settings }))

  v1.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'pawnia API', version },
    servers: [{ url: API_V1_PREFIX }],
  })
  v1.get('/docs', Scalar({ url: `${API_V1_PREFIX}/openapi.json`, pageTitle: 'pawnia API' }))
  // MCP for Claude Code (not in the OpenAPI document: a protocol of its own). Only a running
  // answer's token opens it.
  if (mcp) v1.all('/mcp/:token', (c) => mcp.handle(c.req.raw, c.req.param('token')))

  const app = new OpenAPIHono().route(API_V1_PREFIX, v1)
  app.notFound((c) =>
    problem(c, 404, 'Not Found', { detail: `No route for ${c.req.method} ${c.req.path}` }),
  )
  app.onError((err, c) => {
    console.error(err)
    return problem(c, 500, 'Internal Server Error')
  })
  return app
}

export type AppType = ReturnType<typeof createApp>
