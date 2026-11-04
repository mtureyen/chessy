import type { ChatMessage } from '../domain/messages'
import type { ConversationStore } from '../ports/conversationStore'

/** Conversations in memory, the least recently used dropped beyond `limit`. */
export class InMemoryConversationStore implements ConversationStore {
  private readonly conversations = new Map<string, ChatMessage[]>()
  private readonly limit: number

  constructor(limit = 100) {
    this.limit = limit
  }

  async load(id: string): Promise<ChatMessage[] | undefined> {
    const messages = this.conversations.get(id)
    if (!messages) return undefined
    // Re-insert: Map keeps insertion order, so the first key is the least recently used.
    this.conversations.delete(id)
    this.conversations.set(id, messages)
    return structuredClone(messages)
  }

  async save(id: string, messages: ChatMessage[]): Promise<void> {
    this.conversations.delete(id)
    this.conversations.set(id, structuredClone(messages))
    while (this.conversations.size > this.limit) {
      this.conversations.delete(this.conversations.keys().next().value!)
    }
  }
}
