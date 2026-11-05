/**
 * Asks the configured coach a real question and prints the answer as it streams, the tools it
 * used and the tokens it cost: a live check of a provider (costs a few cents on the Claude API).
 *
 *   bun run coach:check [agent id] ["question"]
 *
 * Uses the same configuration and tools as the API (the settings page, else apps/api/.env):
 * the native engine for the evaluation tool (`bun run engine:native`), Maia for human moves, and
 * the database (DATABASE_URL) for the user's games. Agents: claude-api (the default),
 * claude-headless (your subscription), ollama, openai-compatible.
 */
import { fileURLToPath } from 'node:url'
import { CoachRegistry } from '../src/adapters/coach/agents'
import { effectiveCoach } from '../src/adapters/settings/coachSettings'
import { FileSettingsStore } from '../src/adapters/settings/fileSettingsStore'
import { createCoachTools } from '../src/adapters/coach/tools'
import { openDatabase } from '../src/adapters/db/database'
import { DatabaseLibraryService } from '../src/adapters/db/service'
import { createMaiaService } from '../src/adapters/humanMoves/maia'
import {
  createNativeEngineService,
  defaultPoolSize,
  resolveStockfishPath,
} from '../src/adapters/engine/native'
import { loadConfig } from '../src/config'

const [wanted, question = 'Who stands better here, and what should White play?'] =
  process.argv.slice(2)
const config = loadConfig(process.env)
const engine = createNativeEngineService({
  path: resolveStockfishPath(config.STOCKFISH_PATH),
  poolSize: Math.min(2, defaultPoolSize()),
  hashMb: config.ENGINE_HASH_MB,
})
// Claude Code gets the tools over MCP: serve them here for the length of the check.
let mcpHandler: ((request: Request, token: string) => Promise<Response>) | undefined
const server = Bun.serve({
  port: 0,
  idleTimeout: 255, // an engine search for a tool call can take longer than Bun's 10 s default
  fetch: (request) => {
    const token = /\/api\/v1\/mcp\/([^/]+)$/.exec(new URL(request.url).pathname)?.[1]
    return token && mcpHandler
      ? mcpHandler(request, token)
      : new Response('Not found', { status: 404 })
  },
})
// The same settings as the API: the settings page's file over .env.
const stored = await new FileSettingsStore(
  config.SETTINGS_PATH ?? fileURLToPath(new URL('../.chessy/settings.json', import.meta.url)),
).load()
const library = new DatabaseLibraryService(
  config.DATABASE_URL ? () => openDatabase(config.DATABASE_URL!) : undefined,
)
const tools = createCoachTools({
  engine,
  humanMoves: createMaiaService(config.MAIA_MODEL_PATH),
  history: { history: library, profile: () => library.profile() },
})
const registry = new CoachRegistry(tools, {
  baseUrl: `http://127.0.0.1:${server.port}`,
  version: 'check',
})
registry.configure(effectiveCoach(config, stored.coach))
const agents = registry.agents()
mcpHandler = registry.mcp.handle
const agent = wanted ? agents.find((a) => a.id === wanted) : agents[0]
if (!agent) throw new Error(`No coach agent ${wanted ?? ''} (have: ${agents.map((a) => a.id)})`)
const status = await agent.status()
if (!status.available) throw new Error(`${agent.label} is unavailable: ${status.reason}`)

// After 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5: the Fried Liver area, plenty to explain.
const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4'
console.log(`${agent.label}: ${question}\n`)
const started = Date.now()
await agent.answer(
  { conversationId: crypto.randomUUID(), question, context: { fen, rating: 800 } },
  (event) => {
    if (event.type === 'text') process.stdout.write(event.delta)
    else if (event.type === 'tool')
      console.log(`\n[tool ${event.name} ${JSON.stringify(event.input)}]`)
    else if (event.type === 'board') console.log(`\n[board ${JSON.stringify(event.drawing)}]`)
    else if (event.type === 'error') console.error(`\n[error] ${event.message}`)
    else if (event.type === 'done') {
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      console.log(
        `\n\n[${seconds}s, ${event.usage.inputTokens} in / ${event.usage.outputTokens} out tokens]`,
      )
    }
  },
)
process.exit(0)
