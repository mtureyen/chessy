import type { CoachEvent } from '../domain/messages'
import { COMMENT_PROMPT, commentText, questionText, SYSTEM_PROMPT } from '../domain/prompt'
import type { CoachTool } from '../domain/tools'
import type { CoachAgent, CoachRequest, CommentRequest, ComposeRequest } from '../ports/coachAgent'
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
          ...(request.context && { context: request.context }),
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

  comment({ signal, ...move }: CommentRequest): Promise<string> {
    return this.compose({
      system: COMMENT_PROMPT,
      text: commentText(move),
      ...(signal && { signal }),
    })
  }

  /** One turn outside the tool loop: this path holds no tools and touches no conversation. */
  async compose({ system, text: prompt, signal }: ComposeRequest): Promise<string> {
    const turn = await this.client.turn(
      {
        system,
        messages: [{ role: 'user', text: prompt }],
        tools: [],
        ...(signal && { signal }),
      },
      () => {},
    )
    const text = turn.text.trim()
    if (turn.stop !== 'end' || !text) throw new Error(`No comment (${turn.stop})`)
    return text
  }
}
