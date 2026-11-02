import { createRoute, z } from '@hono/zod-openapi'
import type { PositionEval } from '@chessy/analysis'
import { ProblemSchema } from './problem'

const ScoreSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cp'), value: z.number().int() }),
  z.object({
    type: z.literal('mate'),
    winner: z.enum(['white', 'black']),
    moves: z.number().int().nonnegative(),
  }),
])

export const PositionEvalSchema = z
  .object({
    depth: z.number().int().nonnegative(),
    lines: z.array(
      z.object({
        rank: z.number().int().positive(),
        depth: z.number().int().nonnegative(),
        score: ScoreSchema,
        pv: z.array(z.string()),
      }),
    ),
  })
  .openapi('PositionEval') satisfies z.ZodType<PositionEval>

export const EngineStatusSchema = z
  .union([
    z.object({
      available: z.literal(true),
      name: z.string().openapi({ example: 'Stockfish 19' }),
      parallelism: z.number().int().positive().openapi({ example: 8 }),
    }),
    z.object({ available: z.literal(false), reason: z.string() }),
  ])
  .openapi('EngineStatus')

export type EngineStatusBody = z.infer<typeof EngineStatusSchema>

export const EvaluationRequestSchema = z
  .object({
    fens: z.array(z.string().max(100)).min(1).max(1000),
    nodes: z.number().int().min(1_000).max(5_000_000).openapi({ example: 500_000 }),
    multiPv: z.number().int().min(1).max(5).openapi({ example: 2 }),
  })
  .openapi('EvaluationRequest')

/** One line of the NDJSON response stream. */
export const EvaluationEventSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('evaluated'),
      index: z.number().int().nonnegative(),
      eval: PositionEvalSchema,
    }),
    z.object({ type: z.literal('done') }),
    z.object({ type: z.literal('error'), message: z.string() }),
  ])
  .openapi('EvaluationEvent')

export type EvaluationEvent = z.infer<typeof EvaluationEventSchema>

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ProblemSchema } },
})

export const engineStatusRoute = createRoute({
  method: 'get',
  path: '/engine',
  tags: ['engine'],
  summary: 'Whether the server has a native engine, and how many positions it evaluates at once',
  responses: {
    200: {
      description: 'Engine status',
      content: { 'application/json': { schema: EngineStatusSchema } },
    },
  },
})

export const evaluationsRoute = createRoute({
  method: 'post',
  path: '/engine/evaluations',
  tags: ['engine'],
  summary: 'Evaluate many positions with a fixed node budget',
  description:
    'Streams newline-delimited JSON: one `evaluated` event per position as it finishes (any order), then `done`, or `error`. Each search starts from an empty hash, so results are reproducible. Closing the connection stops the work.',
  request: {
    body: { content: { 'application/json': { schema: EvaluationRequestSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Stream of evaluation events',
      content: { 'application/x-ndjson': { schema: EvaluationEventSchema } },
    },
    400: problem('Invalid request or position'),
    503: problem('No native engine available on this server'),
  },
})
