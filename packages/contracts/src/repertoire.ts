import { createRoute, z } from '@hono/zod-openapi'
import { ProblemSchema } from './problem'

export const RepertoireLineSchema = z
  .object({
    id: z.string(),
    side: z.enum(['white', 'black']),
    title: z.string().openapi({ example: 'Caro-Kann Defense: Advance Variation' }),
    /** SAN from the start. */
    moves: z.array(z.string()).openapi({ example: ['e4', 'c6', 'd4', 'd5', 'e5'] }),
    /** The library opening it came from, if it did. */
    openingId: z.string().optional(),
    source: z.enum(['library', 'practice']).openapi({
      description: 'Added from the library, or by itself after a miss while practising',
    }),
    /** Reviews passed in a row. */
    level: z.number().int(),
    dueAt: z.string().datetime(),
    due: z.boolean(),
    /** When not due: in how many days. */
    inDays: z.number().int().optional(),
    addedAt: z.string().datetime(),
  })
  .openapi('RepertoireLine')

export type RepertoireLineBody = z.infer<typeof RepertoireLineSchema>

export const AddRepertoireLineSchema = z
  .object({
    side: z.enum(['white', 'black']),
    title: z.string().min(1).max(200),
    moves: z.array(z.string().min(2).max(7)).min(1).max(40),
    openingId: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .optional(),
    source: z.enum(['library', 'practice']).default('library'),
  })
  .openapi('AddRepertoireLine')

export type AddRepertoireLineBody = z.input<typeof AddRepertoireLineSchema>

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ProblemSchema } },
})
const unavailable = problem('No game database on this server')
const lineResponse = {
  description: 'The line',
  content: { 'application/json': { schema: z.object({ line: RepertoireLineSchema }) } },
}
const idParams = z.object({ id: z.string().uuid() })

export const repertoireRoute = createRoute({
  method: 'get',
  path: '/repertoire',
  tags: ['openings'],
  summary: 'The user’s repertoire: lines to keep, the due ones first',
  responses: {
    200: {
      description: 'The lines',
      content: {
        'application/json': { schema: z.object({ lines: z.array(RepertoireLineSchema) }) },
      },
    },
    503: unavailable,
  },
})

export const addRepertoireLineRoute = createRoute({
  method: 'post',
  path: '/repertoire',
  tags: ['openings'],
  summary: 'Adds a line to the repertoire (due at once); the same line again changes nothing',
  request: {
    body: { content: { 'application/json': { schema: AddRepertoireLineSchema } }, required: true },
  },
  responses: {
    200: lineResponse,
    400: problem('An illegal move in the line'),
    503: unavailable,
  },
})

export const removeRepertoireLineRoute = createRoute({
  method: 'delete',
  path: '/repertoire/{id}',
  tags: ['openings'],
  summary: 'Takes a line out of the repertoire',
  request: { params: idParams },
  responses: {
    200: {
      description: 'Removed',
      content: { 'application/json': { schema: z.object({ removed: z.literal(true) }) } },
    },
    404: problem('No such line'),
    503: unavailable,
  },
})

export const reviewRepertoireLineRoute = createRoute({
  method: 'post',
  path: '/repertoire/{id}/reviews',
  tags: ['openings'],
  summary:
    'Keeps how a review of a line went: passed, it comes back later (1, 3, 7, 14, 30, 60 days); missed, tomorrow',
  request: {
    params: idParams,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            passed: z.boolean().openapi({ description: 'Every move right at the first try' }),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: lineResponse,
    404: problem('No such line'),
    503: unavailable,
  },
})
