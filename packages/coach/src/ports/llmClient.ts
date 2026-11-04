import type { CancelSignal, ChatMessage, ToolCall, Usage } from '../domain/messages'
import type { CoachTool } from '../domain/tools'

export type ClientStatus = { available: true } | { available: false; reason: string }

/** How a model turn ended. */
export type TurnStop = 'end' | 'tool_use' | 'max_tokens' | 'refusal'

/** One reply of the model: its text, the tools it wants run, and what to send back next time. */
export interface LlmTurn {
  text: string
  toolCalls: ToolCall[]
  stop: TurnStop
  /** Opaque, for this client only (see ChatMessage). */
  providerState?: unknown
  usage: Usage
}

/**
 * Port: a language model behind some provider's API (Claude, anything OpenAI-compatible such as
 * Ollama, …). One request per call: the tool loop around it is the coach's (runToolLoop).
 */
export interface LlmClient {
  /** e.g. "Claude Opus 5.5" or "qwen3:14b (Ollama)". */
  readonly name: string
  status(): Promise<ClientStatus>
  /** One model turn, its text streamed through `onText` as it comes. */
  turn(
    request: { system: string; messages: ChatMessage[]; tools: CoachTool[]; signal?: CancelSignal },
    onText: (delta: string) => void,
  ): Promise<LlmTurn>
}
