import { createRoute, z } from '@hono/zod-openapi'
import type { LibraryGame, Profile } from '@chessy/library'
import { ProblemSchema } from './problem'
import { SourceGameSchema, SourceIdSchema } from './sources'

export const LibraryStatusSchema = z
  .union([
    z.object({
      available: z.literal(true),
      database: z.string().openapi({ example: 'PostgreSQL' }),
      games: z.number().int(),
      reviews: z.number().int(),
    }),
    z.object({ available: z.literal(false), reason: z.string() }),
  ])
  .openapi('LibraryStatus')

export type LibraryStatusBody = z.infer<typeof LibraryStatusSchema>

export const LibraryGameSchema = SourceGameSchema.omit({ source: true, url: true, speed: true })
  .extend({
    id: z.string().min(1).max(100),
    source: z.enum(['lichess', 'chesscom', 'chessy']),
    url: z.string().url().optional(),
    speed: z.enum([
      'ultrabullet',
      'bullet',
      'blitz',
      'rapid',
      'classical',
      'correspondence',
      'unlimited',
    ]),
    importedAt: z.string().datetime(),
  })
  .openapi('LibraryGame') satisfies z.ZodType<LibraryGame>

const MOVE_CLASSES = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
] as const

/**
 * A finished review as the app computed it. Only the fields statistics rely on are checked; the
 * server keeps the review as sent.
 */
export const GameReviewSchema = z
  .object({
    startFen: z.string().max(100),
    positions: z.array(z.unknown()),
    moves: z.array(
      z.object({
        ply: z.number().int().min(1),
        color: z.enum(['white', 'black']),
        san: z.string().max(10),
        uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
        winBefore: z.number(),
        winAfter: z.number(),
        accuracy: z.number(),
        classification: z.enum(MOVE_CLASSES),
        best: z.object({ uci: z.string(), san: z.string() }).optional(),
      }),
    ),
    accuracy: z.object({ white: z.number().optional(), black: z.number().optional() }),
    counts: z.unknown(),
    settings: z.object({
      engine: z.string(),
      nodes: z.number().int(),
      humanMoves: z.string().optional(),
    }),
  })
  .openapi('GameReview')

export const ProfileSchema = z
  .object({
    id: z.string().min(1).max(100),
    displayName: z.string().min(1).max(50),
    accounts: z
      .array(
        z.object({
          source: SourceIdSchema,
          username: z.string().regex(/^[A-Za-z0-9_-]{2,30}$/),
        }),
      )
      .max(2),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('Profile') satisfies z.ZodType<Profile>

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ProblemSchema } },
})

const unavailable = problem('No game database on this server')

export const libraryStatusRoute = createRoute({
  method: 'get',
  path: '/library',
  tags: ['library'],
  summary: 'Whether the server keeps a copy of the game history, and how much it holds',
  responses: {
    200: {
      description: 'Library status',
      content: { 'application/json': { schema: LibraryStatusSchema } },
    },
  },
})

export const saveLibraryGamesRoute = createRoute({
  method: 'post',
  path: '/library/games',
  tags: ['library'],
  summary: 'Stores games (insert or update by id)',
  description: 'The app sends what it saves or imports; sending a game again updates it.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ games: z.array(LibraryGameSchema).min(1).max(500) }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Stored',
      content: { 'application/json': { schema: z.object({ stored: z.number().int() }) } },
    },
    400: problem('Invalid game or PGN'),
    409: problem('A platform game is already stored under another id'),
    503: unavailable,
  },
})

export const missingLibraryGamesRoute = createRoute({
  method: 'post',
  path: '/library/games/missing',
  tags: ['library'],
  summary: 'Which of these game ids the server does not have yet',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ ids: z.array(z.string().min(1).max(100)).max(5000) }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'The missing ids, in the order sent',
      content: { 'application/json': { schema: z.object({ missing: z.array(z.string()) }) } },
    },
    503: unavailable,
  },
})

export const saveLibraryReviewRoute = createRoute({
  method: 'post',
  path: '/library/reviews',
  tags: ['library'],
  summary: 'Stores a finished review of a main line',
  description:
    'Kept per line (start position + moves), replacing an older review of it; it belongs to every stored game with that main line.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            startFen: z.string().max(100),
            moves: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)).max(1000),
            review: GameReviewSchema,
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Stored',
      content: { 'application/json': { schema: z.object({ stored: z.literal(true) }) } },
    },
    400: problem('Invalid review'),
    503: unavailable,
  },
})

export const getProfileRoute = createRoute({
  method: 'get',
  path: '/profile',
  tags: ['library'],
  summary: 'The user’s profile kept on the server (null before they set one up)',
  responses: {
    200: {
      description: 'The profile',
      content: { 'application/json': { schema: z.object({ profile: ProfileSchema.nullable() }) } },
    },
    503: unavailable,
  },
})

export const saveProfileRoute = createRoute({
  method: 'put',
  path: '/profile',
  tags: ['library'],
  summary: 'Keeps the user’s profile (one per installation for now)',
  request: {
    body: {
      content: { 'application/json': { schema: z.object({ profile: ProfileSchema }) } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Stored',
      content: { 'application/json': { schema: z.object({ stored: z.literal(true) }) } },
    },
    400: problem('Invalid profile'),
    503: unavailable,
  },
})
