import { existsSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
import { EnginePoolEvaluator, UciEngine } from '@pawnia/analysis'
import { createProcessTransport } from './processTransport'
import { SerialEngineService, type EngineService } from './service'

/** Where `bun run engine:native` puts the official build. */
export const BUNDLED_STOCKFISH = fileURLToPath(
  new URL('../../../.engine/stockfish', import.meta.url),
)

/** Explicit path, else the downloaded build, else `stockfish` on the PATH (e.g. Homebrew). */
export function resolveStockfishPath(configured: string | undefined): string {
  if (configured) return configured
  return existsSync(BUNDLED_STOCKFISH) ? BUNDLED_STOCKFISH : 'stockfish'
}

/** Leave two cores for everything else; more than 8 parallel searches gains little. */
export function defaultPoolSize(): number {
  return Math.min(8, Math.max(1, availableParallelism() - 2))
}

export interface NativeEngineConfig {
  path: string
  poolSize: number
  hashMb: number
}

/** N single-threaded Stockfish processes, started on first use. */
export function createNativeEngineService({
  path,
  poolSize,
  hashMb,
}: NativeEngineConfig): EngineService {
  const engines = Array.from(
    { length: poolSize },
    () => new UciEngine(() => createProcessTransport(path), { hashMb, initTimeoutMs: 10_000 }),
  )
  return new SerialEngineService(new EnginePoolEvaluator(engines))
}
