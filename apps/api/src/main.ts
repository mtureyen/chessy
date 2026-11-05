import { CachedGameSource, type GameSource, type SourceId } from '@chessy/library'
import pkg from '../package.json' with { type: 'json' }
import {
  createNativeEngineService,
  defaultPoolSize,
  resolveStockfishPath,
} from './adapters/engine/native'
import { fileURLToPath } from 'node:url'
import { CoachRegistry } from './adapters/coach/agents'
import { evaluatePositionTool } from './adapters/coach/tools/evaluatePosition'
import { openDatabase } from './adapters/db/database'
import { FileSettingsService } from './adapters/settings/fileSettingsService'
import { FileSettingsStore } from './adapters/settings/fileSettingsStore'
import { DatabaseLibraryService } from './adapters/db/service'
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
// The coach follows the settings page (apps/api/.chessy/settings.json) over .env, live.
const coach = new CoachRegistry([evaluatePositionTool(engine)], {
  // Claude Code reaches the tools here over MCP; the API listens on 127.0.0.1 at least.
  baseUrl: `http://127.0.0.1:${config.PORT}`,
  version: pkg.version,
})
const settings = new FileSettingsService(
  config,
  new FileSettingsStore(
    config.SETTINGS_PATH ?? fileURLToPath(new URL('../.chessy/settings.json', import.meta.url)),
  ),
  coach,
)
await settings.load()
const app = createApp({
  version: pkg.version,
  startedAt: Date.now(),
  sources: createSources(config),
  engine,
  humanMoves: createMaiaService(config.MAIA_MODEL_PATH),
  library: new DatabaseLibraryService(
    config.DATABASE_URL ? () => openDatabase(config.DATABASE_URL!) : undefined,
  ),
  coach,
  mcp: coach.mcp,
  settings,
  localHostNamesOnly: ['127.0.0.1', 'localhost', '::1'].includes(config.HOST),
})

console.log(
  `chessy-api ${pkg.version} listening on http://${config.HOST}:${config.PORT} (${config.NODE_ENV}, sources: ${config.CHESSY_SOURCES}, engine: ${stockfishPath} ×${poolSize}, history: ${config.DATABASE_URL ? 'database' : 'off'}, coach: ${
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
    userAgent: `Chessy/${pkg.version} (+https://github.com/mtureyen/chessy)`,
    ...(config.CHESSY_SOURCES === 'recorded' ? { fetch: recordedFetch } : {}),
  }
  return {
    lichess: new CachedGameSource(new LichessGameSource(http)),
    chesscom: new CachedGameSource(new ChessComGameSource(http)),
  }
}
