import Anthropic from '@anthropic-ai/sdk'
import {
  InMemoryConversationStore,
  LoopAgent,
  type CoachAgent,
  type CoachTool,
  type ConversationStore,
  type LlmClient,
} from '@pawnia/coach'
import type { EffectiveCoach } from '../settings/coachSettings'
import { AnthropicClient } from './anthropicClient'
import type { CoachDirectory } from './coachDirectory'
import { HeadlessClaudeAgent } from './headlessClaudeAgent'
import { CoachRuns, handleMcpRequest } from './mcp'
import type { McpEndpoint } from './mcpEndpoint'
import { OpenAiCompatibleClient } from './openAiCompatibleClient'

/** Where this API listens and its version, for the MCP endpoint Claude Code gets tools from. */
export interface ServerInfo {
  baseUrl: string
  version: string
}

/**
 * The coach's agents, rebuilt whenever its settings change (no restart). Conversations and
 * running answers survive a rebuild; the default agent comes first, then the others.
 */
export class CoachRegistry implements CoachDirectory {
  readonly mcp: McpEndpoint
  private readonly tools: CoachTool[]
  private readonly server: ServerInfo
  private readonly conversations: ConversationStore = new InMemoryConversationStore()
  private readonly runs = new CoachRuns()
  private current: CoachAgent[] = []

  constructor(tools: CoachTool[], server: ServerInfo) {
    this.tools = tools
    this.server = server
    this.mcp = {
      handle: (request, token) =>
        handleMcpRequest(request, token, { tools, runs: this.runs, version: server.version }),
    }
  }

  configure(coach: EffectiveCoach): void {
    const agents = createCoachAgents(coach, this.tools, this.server, {
      conversations: this.conversations,
      runs: this.runs,
    })
    const preferred = agents.find((agent) => agent.id === coach.defaultAgent)
    this.current = preferred ? [preferred, ...agents.filter((a) => a !== preferred)] : agents
  }

  agents(): CoachAgent[] {
    return this.current
  }
}

/** The agents the settings switch on, each with the same tools. */
export function createCoachAgents(
  coach: EffectiveCoach,
  tools: CoachTool[],
  server: ServerInfo,
  shared: { conversations: ConversationStore; runs: CoachRuns } = {
    conversations: new InMemoryConversationStore(),
    runs: new CoachRuns(),
  },
): CoachAgent[] {
  const { conversations, runs } = shared
  const loop = (id: string, label: string, client: LlmClient) =>
    new LoopAgent({ id, label, client, tools, conversations })
  const agents: CoachAgent[] = []

  const { claudeApi, claudeHeadless, ollama, openAiCompatible } = coach
  if (claudeApi.enabled) {
    const { model, label, effort, apiKey } = claudeApi
    // Without a key of its own the SDK looks in the environment (and the `ant` login).
    const client = apiKey ? new Anthropic({ apiKey }) : undefined
    agents.push(
      loop(
        'claude-api',
        `${label} (API)`,
        new AnthropicClient({ model, label, effort, ...(client && { client }) }),
      ),
    )
  }
  if (claudeHeadless.enabled) {
    agents.push(
      new HeadlessClaudeAgent({
        command: claudeHeadless.command,
        ...(claudeHeadless.model && { model: claudeHeadless.model }),
        tools,
        runs,
        mcpUrl: (token) => `${server.baseUrl}/api/v1/mcp/${token}`,
        conversations,
      }),
    )
  }
  if (ollama.enabled) {
    const label = `${ollama.model} (Ollama, local)`
    agents.push(
      loop(
        'ollama',
        label,
        new OpenAiCompatibleClient({
          baseUrl: ollama.url,
          model: ollama.model,
          label,
          unreachableHint: 'is Ollama running?',
          missingModelHint: (name) => `Model ${name} is not installed: ollama pull ${name}`,
        }),
      ),
    )
  }
  if (openAiCompatible.enabled && openAiCompatible.url && openAiCompatible.model) {
    const { url, model, apiKey } = openAiCompatible
    const label = openAiCompatible.label ?? model
    agents.push(
      loop(
        'openai-compatible',
        label,
        new OpenAiCompatibleClient({ baseUrl: url, model, label, ...(apiKey && { apiKey }) }),
      ),
    )
  }
  return agents
}
