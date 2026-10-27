import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** `live` talks to lichess/chess.com; `recorded` answers from recorded responses (E2E, offline). */
  CHESSY_SOURCES: z.enum(['live', 'recorded']).default('live'),
})

export type Config = z.infer<typeof EnvSchema>

/** Fails fast on startup if the environment is invalid. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  return EnvSchema.parse(env)
}
