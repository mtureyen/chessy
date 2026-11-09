import type { CoachDrawing, CoachEventBody, CoachQuestionBody } from '@pawnia/contracts'

export type CoachContext = NonNullable<CoachQuestionBody['context']>

/** A drawing as the board shows it: always with the position it belongs to. */
export type PlacedDrawing = Omit<CoachDrawing, 'fen'> & { fen: string }

export interface UserMessage {
  id: string
  role: 'user'
  text: string
}

export interface CoachMessage {
  id: string
  role: 'coach'
  text: string
  /** The tools it used, in order; `ok` is undefined while one runs. */
  tools: { name: string; ok?: boolean }[]
  drawings: PlacedDrawing[]
  status: 'answering' | 'done' | 'stopped' | 'failed'
  /** A tool ran since the last text: the next text starts a new paragraph. */
  toolSinceText?: boolean
  error?: string
  usage?: { inputTokens: number; outputTokens: number }
}

export type ChatMessage = UserMessage | CoachMessage

/** A reply with one more event of its stream applied. */
export function applyEvent(
  reply: CoachMessage,
  event: CoachEventBody,
  drawing: PlacedDrawing | undefined,
): CoachMessage {
  switch (event.type) {
    case 'text': {
      // What the model writes before and after a tool call are separate thoughts.
      const gap = reply.toolSinceText && reply.text && !reply.text.endsWith('\n') ? '\n\n' : ''
      return { ...reply, text: reply.text + gap + event.delta, toolSinceText: false }
    }
    case 'tool':
      return { ...reply, tools: [...reply.tools, { name: event.name }], toolSinceText: true }
    case 'tool_result': {
      // The latest call of that tool still running.
      const index = reply.tools.findLastIndex((t) => t.name === event.name && t.ok === undefined)
      if (index < 0) return reply
      const tools = reply.tools.map((t, i) => (i === index ? { ...t, ok: event.ok } : t))
      return { ...reply, tools }
    }
    case 'board':
      return drawing ? { ...reply, drawings: [...reply.drawings, drawing] } : reply
    case 'done':
      return { ...reply, status: 'done', usage: event.usage }
    case 'error':
      return { ...reply, status: 'failed', error: event.message }
  }
}

/** A drawing on its own position, or on the one the question was asked in. */
export function placed(drawing: CoachDrawing, context: CoachContext): PlacedDrawing | undefined {
  const fen = drawing.fen ?? context.fen
  return fen ? { ...drawing, fen } : undefined
}
