import {
  InMemoryConversationStore,
  LoopAgent,
  type CoachAgent,
  type CoachTool,
} from '@chessy/coach'
import type { Config } from '../../config'
import { AnthropicClient } from './anthropicClient'
import { HeadlessClaudeAgent } from './headlessClaudeAgent'
import { CoachRuns, handleMcpRequest } from './mcp'
import type { McpEndpoint } from './mcpEndpoint'
import { OpenAiCompatibleClient } from './openAiCompatibleClient'

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface CoachConfig {
  /** Claude through the API (ANTHROPIC_API_KEY); `false` leaves it out. */
  anthropic: false | { model: string; label: string; effort: Effort }
  /** Claude Code in headless mode, on the user's subscription. */
  headless: false | { command: string; model?: string }
  /** A local model in Ollama. */
  ollama: false | { baseUrl: string; model: string }
  /** Any other OpenAI-compatible API. */
  openAiCompatible: false | { baseUrl: string; model: string; label: string; apiKey?: string }
}

/** The coach providers the environment asks for (see config.ts). */
export function coachConfig(config: Config): CoachConfig {
  const openAiModel = config.COACH_OPENAI_MODEL
  return {
    anthropic: config.COACH_CLAUDE_API === 'on' && {
      model: config.COACH_CLAUDE_MODEL,
      label: config.COACH_CLAUDE_LABEL,
      effort: config.COACH_CLAUDE_EFFORT,
    },
    headless: config.COACH_CLAUDE_HEADLESS === 'on' && {
      command: config.COACH_CLAUDE_COMMAND,
      ...(config.COACH_CLAUDE_HEADLESS_MODEL && { model: config.COACH_CLAUDE_HEADLESS_MODEL }),
    },
    ollama: config.COACH_OLLAMA === 'on' && {
      baseUrl: config.COACH_OLLAMA_URL,
      model: config.COACH_OLLAMA_MODEL,
    },
    openAiCompatible:
      config.COACH_OPENAI_URL && openAiModel
        ? {
            baseUrl: config.COACH_OPENAI_URL,
            model: openAiModel,
            label: config.COACH_OPENAI_LABEL ?? openAiModel,
            ...(config.COACH_OPENAI_KEY && { apiKey: config.COACH_OPENAI_KEY }),
          }
        : false,
  }
}

/**
 * The coach agents this server offers, each with the same tools; the first available one is the
 * default. `server` says where this API listens and its version, for the MCP endpoint that
 * agents running their own loop (Claude Code) get the tools from.
 */
export function createCoachAgents(
  config: CoachConfig,
  tools: CoachTool[],
  server: { baseUrl: string; version: string } = { baseUrl: 'http://localhost:3000', version: '0' },
): { agents: CoachAgent[]; mcp: McpEndpoint } {
  const runs = new CoachRuns()
  const mcp: McpEndpoint = {
    handle: (request, token) =>
      handleMcpRequest(request, token, { tools, runs, version: server.version }),
  }
  const conversations = new InMemoryConversationStore()
  const agent = (
    id: string,
    label: string,
    client: ConstructorParameters<typeof LoopAgent>[0]['client'],
  ) => new LoopAgent({ id, label, client, tools, conversations })
  const agents: CoachAgent[] = []
  if (config.anthropic) {
    const { model, label, effort } = config.anthropic
    agents.push(
      agent('claude-api', `${label} (API)`, new AnthropicClient({ model, label, effort })),
    )
  }
  if (config.headless) {
    const { command, model } = config.headless
    agents.push(
      new HeadlessClaudeAgent({
        command,
        ...(model && { model }),
        tools,
        runs,
        mcpUrl: (token) => `${server.baseUrl}/api/v1/mcp/${token}`,
      }),
    )
  }
  if (config.ollama) {
    const { baseUrl, model } = config.ollama
    const label = `${model} (Ollama, local)`
    agents.push(
      agent(
        'ollama',
        label,
        new OpenAiCompatibleClient({
          baseUrl,
          model,
          label,
          unreachableHint: 'is Ollama running?',
          missingModelHint: (name) => `Model ${name} is not installed: ollama pull ${name}`,
        }),
      ),
    )
  }
  if (config.openAiCompatible) {
    const { baseUrl, model, label, apiKey } = config.openAiCompatible
    agents.push(
      agent(
        'openai-compatible',
        label,
        new OpenAiCompatibleClient({ baseUrl, model, label, ...(apiKey && { apiKey }) }),
      ),
    )
  }
  return { agents, mcp }
}
