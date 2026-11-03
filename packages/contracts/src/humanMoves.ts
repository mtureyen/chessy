import { createRoute, z } from '@hono/zod-openapi'
import { ProblemSchema } from './problem'

export const HumanMovesStatusSchema = z
  .union([
    z.object({
      available: z.literal(true),
      name: z.string().openapi({ example: 'Maia-3' }),
    }),
    z.object({ available: z.literal(false), reason: z.string() }),
  ])
  .openapi('HumanMovesStatus')

export type HumanMovesStatusBody = z.infer<typeof HumanMovesStatusSchema>

const Elo = z.number().int().min(100).max(3500)

export const MoveProbabilitiesRequestSchema = z
  .object({
    queries: z
      .array(
        z.object({
          fen: z.string().max(100),
          move: z
            .string()
            .regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)
            .openapi({ example: 'e2e4' }),
          eloSelf: Elo.openapi({ example: 1500 }),
          eloOppo: Elo.openapi({ example: 1500 }),
        }),
      )
      .min(1)
      .max(1000),
  })
  .openapi('MoveProbabilitiesRequest')

export const MoveProbabilitiesSchema = z
  .object({ probabilities: z.array(z.number().min(0).max(1)) })
  .openapi('MoveProbabilities')

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ProblemSchema } },
})

export const humanMovesStatusRoute = createRoute({
  method: 'get',
  path: '/human-moves',
  tags: ['human moves'],
  summary: 'Whether the server can tell how likely humans of a rating play a move (Maia)',
  responses: {
    200: {
      description: 'Human-move model status',
      content: { 'application/json': { schema: HumanMovesStatusSchema } },
    },
  },
})

export const moveProbabilitiesRoute = createRoute({
  method: 'post',
  path: '/human-moves/probabilities',
  tags: ['human moves'],
  summary: 'How likely players of the given ratings play the given moves',
  description:
    'One probability (0–1) per query, in order; 0 for a move that is not legal in its position. All queries run as one batch.',
  request: {
    body: {
      content: { 'application/json': { schema: MoveProbabilitiesRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Probabilities',
      content: { 'application/json': { schema: MoveProbabilitiesSchema } },
    },
    400: problem('Invalid request or position'),
    503: problem('No human-move model available on this server'),
  },
})
