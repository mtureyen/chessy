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
export {
  COMMENT_PROMPT,
  commentText,
  FOLLOW_UP_EXCHANGES,
  followUpText,
  questionText,
  SYSTEM_PROMPT,
  type CoachContext,
  type CommentedMove,
} from './domain/prompt'
export { defineTool, type CoachTool, type ToolOutput } from './domain/tools'
export type { CoachAgent, CoachRequest, CommentRequest, ComposeRequest } from './ports/coachAgent'
export type { ConversationStore } from './ports/conversationStore'
export type { ClientStatus, LlmClient, LlmTurn, TurnStop } from './ports/llmClient'
export { InMemoryConversationStore } from './adapters/inMemoryConversationStore'
export {
  parseWalkthrough,
  triedText,
  TRY_PROMPT,
  WALKTHROUGH_PROMPT,
  walkthroughText,
  type TriedMove,
  type Walkthrough,
  type WalkthroughFacts,
  type WalkthroughMoment,
} from './domain/walkthrough'
export { LoopAgent } from './usecases/loopAgent'
export { writeWalkthrough } from './usecases/writeWalkthrough'
export {
  OPENING_GUIDE_PROMPT,
  openingGuideText,
  parseOpeningGuide,
  type GuideDrawing,
  type OpeningGuide,
  type OpeningGuideFacts,
} from './domain/openingGuide'
export { writeOpeningGuide } from './usecases/writeOpeningGuide'
export { CoachCancelledError, MAX_TOOL_ROUNDS, runToolLoop } from './usecases/runToolLoop'
