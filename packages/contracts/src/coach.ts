import { createRoute, z } from '@hono/zod-openapi'
import { ProblemSchema } from './problem'

export const CoachAgentsSchema = z
  .object({
    agents: z.array(
      z.object({
        id: z.string().openapi({ example: 'claude-api' }),
        label: z.string().openapi({ example: 'Claude Opus 5.5 (API)' }),
        available: z.boolean(),
        reason: z.string().optional(),
      }),
    ),
  })
  .openapi('CoachAgents')

export type CoachAgentsBody = z.infer<typeof CoachAgentsSchema>

export const CoachQuestionSchema = z
  .object({
    /** Which agent answers; the first available one when left out. */
    agent: z.string().max(50).optional(),
    conversationId: z.string().uuid(),
    question: z.string().min(1).max(4000),
    context: z
      .object({
        fen: z.string().max(100).optional(),
        pgn: z.string().max(20_000).optional(),
        rating: z.number().int().min(100).max(3500).optional(),
      })
      .optional(),
  })
  .openapi('CoachQuestion')

export type CoachQuestionBody = z.infer<typeof CoachQuestionSchema>

/**
 * A notable move of the user's in a game still being played. Only facts about that move: there
 * is no room here for a question, the game so far, or what the engine would have played.
 */
export const CoachCommentSchema = z
  .object({
    /** Which agent comments; the first available one when left out. */
    agent: z.string().max(50).optional(),
    /** The position after the move. */
    fen: z.string().max(100),
    color: z.enum(['white', 'black']),
    moveNumber: z.number().int().min(1).max(1000),
    san: z.string().max(10),
    verdict: z.enum(['brilliant', 'great', 'miss', 'mistake', 'blunder']),
    /** The user's winning chances (%) before and after it. */
    winBefore: z.number().min(0).max(100),
    winAfter: z.number().min(0).max(100),
    /** A piece of the user's the opponent can now win, and what it would gain (pawns). */
    hanging: z
      .object({
        piece: z.enum(['knight', 'bishop', 'rook', 'queen']),
        square: z.string().length(2),
        pawns: z.number().min(0).max(100),
      })
      .optional(),
    /** The opponent can now force mate in this many moves. */
    mateIn: z.number().int().min(1).max(100).optional(),
    rating: z.number().int().min(100).max(3500).optional(),
  })
  .openapi('CoachComment')

export type CoachCommentBody = z.infer<typeof CoachCommentSchema>

export const CoachCommentReplySchema = z
  .object({ text: z.string().openapi({ example: 'That left the rook on a1 undefended.' }) })
  .openapi('CoachCommentReply')

const DrawColor = z.enum(['green', 'red', 'blue', 'yellow'])

/** Arrows and squares the coach draws: on `fen`, or on the position the question was asked in. */
export const CoachDrawingSchema = z.object({
  arrows: z.array(z.object({ from: z.string(), to: z.string(), color: DrawColor })),
  squares: z.array(z.object({ square: z.string(), color: DrawColor })),
  fen: z.string().optional(),
})

export type CoachDrawing = z.infer<typeof CoachDrawingSchema>

/** One event of an answer's stream (the `data` of each server-sent event). */
export const CoachEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), delta: z.string() }),
  z.object({ type: z.literal('tool'), name: z.string(), input: z.unknown() }),
  z.object({ type: z.literal('tool_result'), name: z.string(), ok: z.boolean() }),
  z.object({ type: z.literal('board'), drawing: CoachDrawingSchema }),
  z.object({
    type: z.literal('done'),
    usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
])

export type CoachEventBody = z.infer<typeof CoachEventSchema>

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ProblemSchema } },
})

export const coachAgentsRoute = createRoute({
  method: 'get',
  path: '/coach',
  tags: ['coach'],
  summary: 'The coach agents this server offers and whether each can answer now',
  responses: {
    200: {
      description: 'Agents, the default first',
      content: { 'application/json': { schema: CoachAgentsSchema } },
    },
  },
})

export const coachQuestionRoute = createRoute({
  method: 'post',
  path: '/coach/messages',
  tags: ['coach'],
  summary: 'Ask the coach; the answer streams as server-sent events',
  description:
    'Events (each `data` is JSON with a `type`): `text` (a piece of the answer), `tool` / `tool_result` (the coach used a tool), `board` (arrows and squares to draw), then `done` (with token usage) or `error`. The same `conversationId` continues a conversation.',
  request: {
    body: { content: { 'application/json': { schema: CoachQuestionSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The answer as it is written',
      content: { 'text/event-stream': { schema: z.string() } },
    },
    400: problem('Invalid question'),
    404: problem('No such agent'),
    503: problem('The agent cannot answer now (e.g. no API key, model not running)'),
  },
})

export const coachCommentRoute = createRoute({
  method: 'post',
  path: '/coach/comments',
  tags: ['coach'],
  summary: 'A short comment on a move of a game still being played',
  description:
    'Written from the facts sent and nothing else: the agent gets no tools and no conversation, so it has no engine to ask and nothing is kept.',
  request: {
    body: { content: { 'application/json': { schema: CoachCommentSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The comment',
      content: { 'application/json': { schema: CoachCommentReplySchema } },
    },
    400: problem('Invalid move facts'),
    404: problem('No such agent'),
    502: problem('The agent failed to comment'),
    503: problem('The agent cannot answer now (e.g. no API key, model not running)'),
  },
})

export const CoachWalkthroughRequestSchema = z
  .object({
    /** Which agent writes it; the first available one when left out. */
    agent: z.string().max(50).optional(),
    startFen: z.string().max(100),
    moves: z.array(z.string().max(5)).min(1).max(1000),
    /** The colour the user played; both sides' moments when left out. */
    side: z.enum(['white', 'black']).optional(),
    /** Write it anew even if one is kept. */
    regenerate: z.boolean().optional(),
  })
  .openapi('CoachWalkthroughRequest')

export type CoachWalkthroughRequestBody = z.infer<typeof CoachWalkthroughRequestSchema>

export const CoachWalkthroughSchema = z
  .object({
    summary: z.string(),
    /** The opening: its name, the ply of the last book move, and the coach's words on it. */
    opening: z
      .object({
        name: z.string(),
        ply: z.number().int(),
        text: z.string(),
        record: z
          .object({
            games: z.number().int(),
            wins: z.number().int(),
            draws: z.number().int(),
            losses: z.number().int(),
          })
          .optional(),
      })
      .optional(),
    /** `better` tells what `what` holds back, for after the user looked for it themselves. */
    moments: z.array(
      z.object({ ply: z.number().int(), what: z.string(), better: z.string().optional() }),
    ),
    focus: z.string(),
    /** Who wrote it, e.g. "Claude Opus 5.5 (API)". */
    agent: z.string(),
    /** ISO timestamp. */
    writtenAt: z.string(),
  })
  .openapi('CoachWalkthrough')

export type CoachWalkthroughBody = z.infer<typeof CoachWalkthroughSchema>

export const coachWalkthroughRoute = createRoute({
  method: 'post',
  path: '/coach/walkthroughs',
  tags: ['coach'],
  summary: 'The coach walking the user through a reviewed game',
  description:
    'Written once from the stored review, with no tools and no conversation, and kept: asked again it comes back at once, until a newer review replaces the one it was written from.',
  request: {
    body: {
      content: { 'application/json': { schema: CoachWalkthroughRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'The walkthrough',
      content: { 'application/json': { schema: CoachWalkthroughSchema } },
    },
    400: problem('Invalid request'),
    404: problem('No stored review of this game, or no such agent'),
    502: problem('The agent gave no usable walkthrough'),
    503: problem('The agent cannot answer now, or the server keeps no history'),
  },
})
