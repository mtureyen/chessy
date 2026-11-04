import type { CancelSignal, CoachEvent } from '../domain/messages'
import type { CoachContext } from '../domain/prompt'
import type { ClientStatus } from './llmClient'

/** A question to the coach, in a conversation the agent keeps (so follow-ups have the history). */
export interface CoachRequest {
  /** Chosen by the caller (e.g. a UUID); the same id continues a conversation. */
  conversationId: string
  question: string
  context?: CoachContext
  signal?: CancelSignal
}

/**
 * Port: something that answers the user as the coach, using the coach's tools: a model in our
 * tool loop (LoopAgent), or an agent that runs its own loop (Claude Code).
 */
export interface CoachAgent {
  /** Stable id for choosing it, e.g. "claude-api". */
  readonly id: string
  /** For the user, e.g. "Claude Opus 5.5 (API)". */
  readonly label: string
  status(): Promise<ClientStatus>
  answer(request: CoachRequest, onEvent: (event: CoachEvent) => void): Promise<void>
}
