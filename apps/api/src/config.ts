import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** `live` talks to lichess/chess.com; `recorded` answers from recorded responses (E2E, offline). */
  CHESSY_SOURCES: z.enum(['live', 'recorded']).default('live'),
  /** Native Stockfish binary; default: apps/api/.engine/stockfish, else `stockfish` on the PATH. */
  STOCKFISH_PATH: z.string().min(1).optional(),
  /** Parallel single-threaded engine processes; default: cores − 2, at most 8. */
  ENGINE_POOL_SIZE: z.coerce.number().int().min(1).max(64).optional(),
  ENGINE_HASH_MB: z.coerce.number().int().min(1).max(4096).default(64),
  /** Maia-3 ONNX model (human-like moves); default: apps/api/.maia/ from `bun run maia:fetch`. */
  MAIA_MODEL_PATH: z.string().min(1).optional(),
})

export type Config = z.infer<typeof EnvSchema>

/** Fails fast on startup if the environment is invalid. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  return EnvSchema.parse(env)
}
