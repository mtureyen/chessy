import type {} from './env'
/** Coach context: the AI coach's conversation, tools and tool loop, independent of any provider. */
export type {
  BoardDrawing,
  CancelSignal,
  ChatMessage,
  CoachEvent,
  DrawColor,
  ToolCall,
  ToolResult,
  Usage,
} from './domain/messages'
export { questionText, SYSTEM_PROMPT, type CoachContext } from './domain/prompt'
export { defineTool, type CoachTool, type ToolOutput } from './domain/tools'
export type { CoachAgent, CoachRequest } from './ports/coachAgent'
export type { ConversationStore } from './ports/conversationStore'
export type { ClientStatus, LlmClient, LlmTurn, TurnStop } from './ports/llmClient'
export { InMemoryConversationStore } from './adapters/inMemoryConversationStore'
export { LoopAgent } from './usecases/loopAgent'
export { CoachCancelledError, MAX_TOOL_ROUNDS, runToolLoop } from './usecases/runToolLoop'
