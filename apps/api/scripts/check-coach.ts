/**
 * Asks the configured coach a real question and prints the answer as it streams, the tools it
 * used and the tokens it cost: a live check of a provider (costs a few cents on the Claude API).
 *
 *   bun run coach:check [agent id] ["question"]
 *
 * Uses the same configuration as the API (apps/api/.env: ANTHROPIC_API_KEY, COACH_*) and needs
 * the native engine for the evaluation tool (`bun run engine:native`).
 */
import { createCoachAgents } from '../src/adapters/coach/agents'
import { evaluatePositionTool } from '../src/adapters/coach/tools/evaluatePosition'
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
const agents = createCoachAgents(
  {
    anthropic: config.COACH_CLAUDE_API === 'on' && {
      model: config.COACH_CLAUDE_MODEL,
      label: config.COACH_CLAUDE_LABEL,
      effort: config.COACH_CLAUDE_EFFORT,
    },
  },
  [evaluatePositionTool(engine)],
)
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
