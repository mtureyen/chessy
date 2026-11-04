import { createRoute, z } from '@hono/zod-openapi'
import type { PlayerProfile, SourceGame } from '@chessy/library'
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

const Rating = z.number().int()

export const PlayerProfileSchema = z
  .object({
    source: SourceIdSchema,
    username: z.string().openapi({ example: 'Hikaru' }),
    url: z.string().url(),
    title: z.string().optional().openapi({ example: 'GM' }),
    name: z.string().optional(),
    avatarUrl: z.string().url().optional(),
    country: z.string().optional().openapi({ example: 'US' }),
    ratings: z.object({
      bullet: Rating.optional(),
      blitz: Rating.optional(),
      rapid: Rating.optional(),
      classical: Rating.optional(),
      correspondence: Rating.optional(),
    }),
  })
  .openapi('PlayerProfile') satisfies z.ZodType<PlayerProfile>

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

export const sourceGameRoute = createRoute({
  method: 'get',
  path: '/sources/{source}/games/{id}',
  tags: ['sources'],
  summary: 'One game by the id in its page URL',
  description:
    "lichess: the 8-character game id. chess.com: the game number; chess.com has no lookup by game, so the given user's games of the last months are searched.",
  request: {
    params: z.object({
      source: SourceIdSchema,
      id: z
        .string()
        .regex(/^[A-Za-z0-9]{1,20}$/)
        .openapi({ example: 'HqjDTU4A' }),
    }),
    query: z.object({
      username: z
        .string()
        .regex(/^[A-Za-z0-9_-]{2,30}$/)
        .optional()
        .openapi({ example: '8sly' }),
    }),
  },
  responses: {
    200: {
      description: 'The game',
      content: { 'application/json': { schema: z.object({ game: SourceGameSchema }) } },
    },
    400: problem('Invalid source, id or username'),
    404: problem('No such game, or not among the user’s games; or the user does not exist'),
    429: problem('The platform asked us to slow down; see Retry-After'),
    502: problem('The platform could not be reached or failed'),
  },
})

export const playerRoute = createRoute({
  method: 'get',
  path: '/sources/{source}/users/{username}',
  tags: ['sources'],
  summary: "An account's public profile and current ratings",
  description: 'For confirming "is this you?" when the user links their account.',
  request: {
    params: z.object({
      source: SourceIdSchema,
      username: z
        .string()
        .regex(/^[A-Za-z0-9_-]{2,30}$/)
        .openapi({ example: 'Hikaru' }),
    }),
  },
  responses: {
    200: {
      description: 'The profile',
      content: { 'application/json': { schema: z.object({ player: PlayerProfileSchema }) } },
    },
    400: problem('Invalid source or username'),
    404: problem('The user does not exist on that platform'),
    429: problem('The platform asked us to slow down; see Retry-After'),
    502: problem('The platform could not be reached or failed'),
  },
})

export const historyRoute = createRoute({
  method: 'get',
  path: '/sources/{source}/users/{username}/history',
  tags: ['sources'],
  summary: "A page of a user's whole game history, newest first",
  description:
    "Start without `cursor`, then pass each page's `next` until there is none. chess.com: a month per page; lichess: 200 games per page. `since` (ISO time) limits it to games played since then. Standard chess only; requests to each platform run one at a time.",
  request: {
    params: z.object({
      source: SourceIdSchema,
      username: z
        .string()
        .regex(/^[A-Za-z0-9_-]{2,30}$/)
        .openapi({ example: '8sly' }),
    }),
    query: z.object({
      cursor: z
        .string()
        .regex(/^\d+:[\d/,]*$/)
        .max(4000)
        .optional()
        .openapi({ example: '39:2026/09,2026/08' }),
      since: z.string().datetime().optional(),
    }),
  },
  responses: {
    200: {
      description: 'The page',
      content: {
        'application/json': {
          schema: z
            .object({
              games: z.array(SourceGameSchema),
              next: z.string().optional(),
              progress: z.object({
                done: z.number().int(),
                total: z.number().int().optional(),
              }),
            })
            .openapi('HistoryPage'),
        },
      },
    },
    400: problem('Invalid source, username, cursor or time'),
    404: problem('The user does not exist on that platform'),
    429: problem('The platform asked us to slow down; see Retry-After'),
    502: problem('The platform could not be reached or failed'),
  },
})
