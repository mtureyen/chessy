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
