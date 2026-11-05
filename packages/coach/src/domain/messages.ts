/** A call the model asked for: one of the coach's tools with its (untrusted) input. */
export interface ToolCall {
  /** The provider's id for the call, echoed with its result. */
  id: string
  name: string
  input: unknown
}

export interface ToolResult {
  callId: string
  /** What the model gets to read: usually JSON. */
  content: string
  isError?: boolean
}

/**
 * The conversation, the same for every provider. An assistant turn keeps `providerState`: what
 * the provider needs back unchanged on the next request (e.g. Claude's thinking blocks); only the
 * client that produced it reads it.
 */
export type ChatMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[]; providerState?: unknown }
  | { role: 'tool'; results: ToolResult[] }

/**
 * Arrows and coloured squares the coach puts on the user's board: on the position it shows, or
 * on the one on the board when `fen` is absent.
 */
export interface BoardDrawing {
  arrows: { from: string; to: string; color: DrawColor }[]
  squares: { square: string; color: DrawColor }[]
  fen?: string
}

/** The colours as the user sees them (the board maps them to its own brushes). */
export type DrawColor = 'green' | 'red' | 'blue' | 'yellow'

/** What the user sees of a coach answer as it happens. */
export type CoachEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; ok: boolean }
  | { type: 'board'; drawing: BoardDrawing }
  | { type: 'done'; usage: Usage }
  | { type: 'error'; message: string }

export interface Usage {
  inputTokens: number
  outputTokens: number
}

/** Something that can be cancelled (an AbortSignal, or anything with `aborted`). */
export interface CancelSignal {
  readonly aborted: boolean
}
