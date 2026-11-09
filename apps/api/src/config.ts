import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  /**
   * Where the API listens: this machine only by default. 0.0.0.0 opens it to the network, and with
   * it everything the API can do (import, the coach with your keys); only on networks you trust.
   */
  HOST: z.string().min(1).default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** `live` talks to lichess/chess.com; `recorded` answers from recorded responses (E2E, offline). */
  PAWNIA_SOURCES: z.enum(['live', 'recorded']).default('live'),
  /** Native Stockfish binary; default: apps/api/.engine/stockfish, else `stockfish` on the PATH. */
  STOCKFISH_PATH: z.string().min(1).optional(),
  /** Parallel single-threaded engine processes; default: cores − 2, at most 8. */
  ENGINE_POOL_SIZE: z.coerce.number().int().min(1).max(64).optional(),
  ENGINE_HASH_MB: z.coerce.number().int().min(1).max(4096).default(64),
  /** Maia-3 ONNX model (human-like moves); default: apps/api/.maia/ from `bun run maia:fetch`. */
  MAIA_MODEL_PATH: z.string().min(1).optional(),
  /** Opening book for reviews on the server; default: the web app's public/openings/book.json. */
  OPENING_BOOK_PATH: z.string().min(1).optional(),
  /**
   * The game history's database: a PostgreSQL URL (see docker-compose.yml), or `pglite:memory` /
   * `pglite:<folder>` for an embedded one. Unset: the server keeps no history.
   */
  DATABASE_URL: z.string().min(1).optional(),
  /** The settings page's file (API keys inside); default: apps/api/.pawnia/settings.json. */
  SETTINGS_PATH: z.string().min(1).optional(),
  /** Claude's API key; the settings page can set one too (it wins). */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /** The coach on Claude through the API (key: ANTHROPIC_API_KEY); `off` leaves it out. */
  COACH_CLAUDE_API: z.enum(['on', 'off']).default('on'),
  COACH_CLAUDE_MODEL: z.string().min(1).default('claude-opus-5-5'),
  COACH_CLAUDE_LABEL: z.string().min(1).default('Claude Opus 5.5'),
  /** How hard Claude thinks per answer: more is slower and costs more. */
  COACH_CLAUDE_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  /** The coach on Claude Code (`claude -p`), on the user's subscription; tools over MCP. */
  COACH_CLAUDE_HEADLESS: z.enum(['on', 'off']).default('on'),
  COACH_CLAUDE_COMMAND: z.string().min(1).default('claude'),
  /** A model alias or id for Claude Code, e.g. "opus"; its own default otherwise. */
  COACH_CLAUDE_HEADLESS_MODEL: z.string().min(1).optional(),
  /** The coach on a local model in Ollama (start Ollama with OLLAMA_CONTEXT_LENGTH=16384). */
  COACH_OLLAMA: z.enum(['on', 'off']).default('off'),
  COACH_OLLAMA_URL: z.string().url().default('http://localhost:11434/v1'),
  COACH_OLLAMA_MODEL: z.string().min(1).default('qwen3:14b'),
  /**
   * Any other OpenAI-compatible API (OpenAI, OpenRouter, Groq, LM Studio, …): set the URL to
   * add it, e.g. https://openrouter.ai/api/v1.
   */
  COACH_OPENAI_URL: z.string().url().optional(),
  COACH_OPENAI_MODEL: z.string().min(1).optional(),
  COACH_OPENAI_KEY: z.string().min(1).optional(),
  COACH_OPENAI_LABEL: z.string().min(1).optional(),
})

export type Config = z.infer<typeof EnvSchema>

/** Variables renamed since; the old name still works while the new one is unset. */
const RENAMED = { CHESSY_SOURCES: 'PAWNIA_SOURCES' } as const

/** Fails fast on startup if the environment is invalid. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const current = { ...env }
  for (const [old, now] of Object.entries(RENAMED)) current[now] ??= env[old]
  return EnvSchema.parse(current)
}
