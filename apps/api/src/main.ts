import { CachedGameSource, type GameSource, type SourceId } from '@chessy/library'
import pkg from '../package.json' with { type: 'json' }
import {
  createNativeEngineService,
  defaultPoolSize,
  resolveStockfishPath,
} from './adapters/engine/native'
import { ChessComGameSource } from './adapters/sources/chesscom'
import { LichessGameSource } from './adapters/sources/lichess'
import { recordedFetch } from './adapters/sources/recorded'
import { createApp } from './app'
import { loadConfig, type Config } from './config'

// Composition root: the only place that knows which adapters fill which ports.
const config = loadConfig(process.env)
const stockfishPath = resolveStockfishPath(config.STOCKFISH_PATH)
const poolSize = config.ENGINE_POOL_SIZE ?? defaultPoolSize()
const app = createApp({
  version: pkg.version,
  startedAt: Date.now(),
  sources: createSources(config),
  engine: createNativeEngineService({
    path: stockfishPath,
    poolSize,
    hashMb: config.ENGINE_HASH_MB,
  }),
})

console.log(
  `chessy-api ${pkg.version} listening on http://localhost:${config.PORT} (${config.NODE_ENV}, sources: ${config.CHESSY_SOURCES}, engine: ${stockfishPath} ×${poolSize})`,
)

export default { port: config.PORT, fetch: app.fetch }

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
