import {
  InMemoryConversationStore,
  LoopAgent,
  type CoachAgent,
  type CoachTool,
} from '@chessy/coach'
import { AnthropicClient } from './anthropicClient'

export interface CoachConfig {
  /** Claude through the API (ANTHROPIC_API_KEY); `false` leaves it out. */
  anthropic:
    false | { model: string; label: string; effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' }
}

/** The coach agents this server offers, each with the same tools; the first is the default. */
export function createCoachAgents(config: CoachConfig, tools: CoachTool[]): CoachAgent[] {
  const conversations = new InMemoryConversationStore()
  const agents: CoachAgent[] = []
  if (config.anthropic) {
    const { model, label, effort } = config.anthropic
    agents.push(
      new LoopAgent({
        id: 'claude-api',
        label: `${label} (API)`,
        client: new AnthropicClient({ model, label, effort }),
        tools,
        conversations,
      }),
    )
  }
  return agents
}
