import type { CoachEvent } from '../domain/messages'
import { questionText, SYSTEM_PROMPT } from '../domain/prompt'
import type { CoachTool } from '../domain/tools'
import type { CoachAgent, CoachRequest } from '../ports/coachAgent'
import type { ConversationStore } from '../ports/conversationStore'
import type { ClientStatus, LlmClient } from '../ports/llmClient'
import { CoachCancelledError, runToolLoop } from './runToolLoop'

/** The coach on any LlmClient: our tool loop, our tools, conversations kept in a store. */
export class LoopAgent implements CoachAgent {
  readonly id: string
  readonly label: string
  private readonly client: LlmClient
  private readonly tools: CoachTool[]
  private readonly conversations: ConversationStore

  constructor(spec: {
    id: string
    label: string
    client: LlmClient
    tools: CoachTool[]
    conversations: ConversationStore
  }) {
    this.id = spec.id
    this.label = spec.label
    this.client = spec.client
    this.tools = spec.tools
    this.conversations = spec.conversations
  }

  status(): Promise<ClientStatus> {
    return this.client.status()
  }

  /** Never throws: failures end the answer with an error event (a cancel ends it silently). */
  async answer(request: CoachRequest, onEvent: (event: CoachEvent) => void): Promise<void> {
    const messages = (await this.conversations.load(request.conversationId)) ?? []
    messages.push({ role: 'user', text: questionText(request.question, request.context) })
    try {
      const { usage } = await runToolLoop(
        this.client,
        {
          system: SYSTEM_PROMPT,
          messages,
          tools: this.tools,
          ...(request.signal && { signal: request.signal }),
        },
        onEvent,
      )
      await this.conversations.save(request.conversationId, messages)
      onEvent({ type: 'done', usage })
    } catch (error) {
      if (error instanceof CoachCancelledError) return
      onEvent({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }
}
