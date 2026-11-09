import { CachedGameSource, type GameSource, type SourceId } from '@pawnia/library'
import pkg from '../package.json' with { type: 'json' }
import {
  createNativeEngineService,
  defaultPoolSize,
  resolveStockfishPath,
} from './adapters/engine/native'
import { fileURLToPath } from 'node:url'
import { CoachRegistry } from './adapters/coach/agents'
import { createCoachTools } from './adapters/coach/tools'
import { StoredWalkthroughs } from './adapters/coach/walkthroughs'
import { createBookLoader } from './adapters/review/openingBook'
import { ReviewQueue, type ReviewJob } from './adapters/review/reviewQueue'
import { createServerReviewer, SERVER_REVIEW_NODES } from './adapters/review/serverReviewer'
import { StoredTraining } from './adapters/training/storedTraining'
import { openDatabase } from './adapters/db/database'
import { FileSettingsService } from './adapters/settings/fileSettingsService'
import { FileSettingsStore } from './adapters/settings/fileSettingsStore'
import { readJson, writeJson } from './adapters/settings/jsonFile'
import { DatabaseLibraryService } from './adapters/db/service'
import { progressKey } from './adapters/db/trainingStore'
import { createMaiaService } from './adapters/humanMoves/maia'
import { ChessComGameSource } from './adapters/sources/chesscom'
import { LichessGameSource } from './adapters/sources/lichess'
import { recordedFetch } from './adapters/sources/recorded'
import { createApp } from './app'
import { loadConfig, type Config } from './config'

// Composition root: the only place that knows which adapters fill which ports.
const config = loadConfig(process.env)
const stockfishPath = resolveStockfishPath(config.STOCKFISH_PATH)
const poolSize = config.ENGINE_POOL_SIZE ?? defaultPoolSize()
const engine = createNativeEngineService({
  path: stockfishPath,
  poolSize,
  hashMb: config.ENGINE_HASH_MB,
})
const humanMoves = createMaiaService(config.MAIA_MODEL_PATH)
const library = new DatabaseLibraryService(
  config.DATABASE_URL ? () => openDatabase(config.DATABASE_URL!) : undefined,
)
const bookPath =
  config.OPENING_BOOK_PATH ??
  fileURLToPath(new URL('../../web/public/openings/book.json', import.meta.url))
const reviewing = { engine, humanMoves, bookPath }
const coachTools = createCoachTools({
  engine,
  humanMoves,
  library,
  review: createServerReviewer(reviewing),
})
// The coach follows the settings page (apps/api/.chessy/settings.json) over .env, live.
const coach = new CoachRegistry(coachTools, {
  // Claude Code reaches the tools here over MCP; the API listens on 127.0.0.1 at least.
  baseUrl: `http://127.0.0.1:${config.PORT}`,
  version: pkg.version,
})
const settingsPath =
  config.SETTINGS_PATH ?? fileURLToPath(new URL('../.chessy/settings.json', import.meta.url))
const settings = new FileSettingsService(config, new FileSettingsStore(settingsPath), coach)
await settings.load()
const reviewJobPath = settingsPath.replace(/\.json$/, '.review-queue.json')
const reviewQueue = new ReviewQueue({
  library,
  reviews: {
    find: (line) => library.findReview(line),
    save: (stored) => library.saveReview(stored),
  },
  // Small batches, so the engine's other users get their turn between them.
  review: createServerReviewer({ ...reviewing, batchSize: 16 }),
  store: {
    load: async () => (await readJson<ReviewJob | null>(reviewJobPath)) ?? undefined,
    save: (job) => writeJson(reviewJobPath, job ?? null),
  },
})
// A run the last shutdown interrupted goes on; without a database there is none to go on with.
reviewQueue.restore().catch((error: unknown) => console.error('Review queue:', error))
const app = createApp({
  version: pkg.version,
  startedAt: Date.now(),
  sources: createSources(config),
  engine,
  humanMoves,
  library,
  reviewQueue,
  training: new StoredTraining(library, progressKey),
  coach,
  walkthroughs: new StoredWalkthroughs(library, createBookLoader(bookPath), {
    review: createServerReviewer(reviewing),
    bestReply: async (fen) => {
      const [position] = await engine.evaluate({
        fens: [fen],
        nodes: SERVER_REVIEW_NODES,
        multiPv: 1,
      })
      return position?.lines[0]?.pv ?? []
    },
  }),
  mcp: coach.mcp,
  settings,
  localHostNamesOnly: ['127.0.0.1', 'localhost', '::1'].includes(config.HOST),
})

console.log(
  `pawnia-api ${pkg.version} listening on http://${config.HOST}:${config.PORT} (${config.NODE_ENV}, sources: ${config.PAWNIA_SOURCES}, engine: ${stockfishPath} ×${poolSize}, history: ${config.DATABASE_URL ? 'database' : 'off'}, coach: ${
    coach
      .agents()
      .map((a) => a.id)
      .join(', ') || 'off'
  })`,
)

// Bun closes a connection after 10 s without data by default; a coach's tool call (an engine
// search over MCP) can take longer. 255 s is Bun's maximum.
export default { port: config.PORT, hostname: config.HOST, fetch: app.fetch, idleTimeout: 255 }

function createSources(config: Config): Record<SourceId, GameSource> {
  const http = {
    userAgent: `pawnia/${pkg.version} (+https://github.com/mtureyen/pawnia)`,
    ...(config.PAWNIA_SOURCES === 'recorded' ? { fetch: recordedFetch } : {}),
  }
  return {
    lichess: new CachedGameSource(new LichessGameSource(http)),
    chesscom: new CachedGameSource(new ChessComGameSource(http)),
  }
}
