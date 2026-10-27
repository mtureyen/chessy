import { createRoute, z } from '@hono/zod-openapi'
import type { SourceGame } from '@chessy/library'
import { ProblemSchema } from './problem'

export const SourceIdSchema = z.enum(['lichess', 'chesscom']).openapi({ example: 'lichess' })

const PlayerSchema = z.object({
  name: z.string(),
  rating: z.number().int().optional(),
})

export const SourceGameSchema = z
  .object({
    source: SourceIdSchema,
    externalId: z.string().openapi({ example: 'HqjDTU4A' }),
    url: z.string().url(),
    pgn: z.string(),
    white: PlayerSchema,
    black: PlayerSchema,
    result: z.enum(['1-0', '0-1', '1/2-1/2', '*']),
    speed: z.enum(['ultrabullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence']),
    timeControl: z.string().optional().openapi({ example: '180+2' }),
    rated: z.boolean(),
    playedAt: z.string().datetime().openapi({ example: '2026-10-14T18:04:06.000Z' }),
    opening: z.object({ eco: z.string().optional(), name: z.string().optional() }).optional(),
  })
  .openapi('SourceGame') satisfies z.ZodType<SourceGame>

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ProblemSchema } },
})

export const recentGamesRoute = createRoute({
  method: 'get',
  path: '/sources/{source}/users/{username}/games',
  tags: ['sources'],
  summary: "A user's most recent games on lichess or chess.com",
  description:
    'Standard chess only, newest first. Results are cached briefly and requests to each platform run one at a time.',
  request: {
    params: z.object({
      source: SourceIdSchema,
      username: z
        .string()
        .regex(/^[A-Za-z0-9_-]{2,30}$/)
        .openapi({ example: 'DrNykterstein' }),
    }),
    query: z.object({
      max: z.coerce.number().int().min(1).max(50).default(20).openapi({ example: 20 }),
    }),
  },
  responses: {
    200: {
      description: 'The games',
      content: { 'application/json': { schema: z.object({ games: z.array(SourceGameSchema) }) } },
    },
    400: problem('Invalid source, username or max'),
    404: problem('The user does not exist on that platform'),
    429: problem('The platform asked us to slow down; see Retry-After'),
    502: problem('The platform could not be reached or failed'),
  },
})
