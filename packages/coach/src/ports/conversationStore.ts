import type { ChatMessage } from '../domain/messages'

/**
 * Port: the coach's conversations, kept on the server so every request carries the full history
 * exactly as the provider produced it (some providers reject a history that was edited).
 */
export interface ConversationStore {
  load(id: string): Promise<ChatMessage[] | undefined>
  save(id: string, messages: ChatMessage[]): Promise<void>
}
