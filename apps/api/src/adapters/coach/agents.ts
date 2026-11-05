import {
  InMemoryConversationStore,
  LoopAgent,
  type CoachAgent,
  type CoachTool,
} from '@chessy/coach'
import type { Config } from '../../config'
import { AnthropicClient } from './anthropicClient'
import { OpenAiCompatibleClient } from './openAiCompatibleClient'

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface CoachConfig {
  /** Claude through the API (ANTHROPIC_API_KEY); `false` leaves it out. */
  anthropic: false | { model: string; label: string; effort: Effort }
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

/** The coach agents this server offers, each with the same tools; the first is the default. */
export function createCoachAgents(config: CoachConfig, tools: CoachTool[]): CoachAgent[] {
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
  return agents
}
