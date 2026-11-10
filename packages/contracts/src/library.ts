import { createRoute, z } from '@hono/zod-openapi'
import type { LibraryGame, Profile } from '@pawnia/library'
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
    source: z.enum(['lichess', 'chesscom', 'pawnia']),
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

/** A main line: where it starts and its moves. */
const GameLineSchema = z.object({
  startFen: z.string().max(100),
  moves: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)).max(1000),
})

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
  description:
    'The app sends what it saves or imports; sending a game again updates it. A platform game already stored under another id (imported in another browser) is not stored twice: it comes back in `renamed` with the id it is kept under, for the app to use too.',
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
      description: 'Stored; games kept under another id are listed in `renamed`',
      content: {
        'application/json': {
          schema: z.object({
            stored: z.number().int(),
            renamed: z.array(
              z.object({
                id: z.string().openapi({ description: 'The id the app sent' }),
                as: z.string().openapi({ description: 'The id the game is kept under' }),
              }),
            ),
          }),
        },
      },
    },
    400: problem('Invalid game or PGN'),
    409: problem('Another upload stored the same platform game at the same time; send it again'),
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
          schema: GameLineSchema.extend({ review: GameReviewSchema }),
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

export const findLibraryReviewRoute = createRoute({
  method: 'post',
  path: '/library/reviews/find',
  tags: ['library'],
  summary: 'The stored review of a main line',
  description: 'A POST because a line can be too long for a URL. The review comes as it was sent.',
  request: {
    body: { content: { 'application/json': { schema: GameLineSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The review',
      content: {
        'application/json': {
          schema: z.object({ review: GameReviewSchema, reviewedAt: z.string().datetime() }),
        },
      },
    },
    404: problem('No review of this line'),
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

export const ReviewQueueSchema = z
  .object({
    status: z.enum(['idle', 'running', 'paused', 'finished', 'failed']),
    /** Games in this run, those reviewed before it included. */
    total: z.number().int(),
    done: z.number().int(),
    /** Games that could not be reviewed and were skipped. */
    failed: z.number().int(),
    reason: z.string().optional(),
  })
  .openapi('ReviewQueue')

export type ReviewQueueBody = z.infer<typeof ReviewQueueSchema>

export const StartReviewQueueSchema = z
  .object({
    count: z.number().int().min(1).max(500).openapi({ example: 30 }),
    speed: z.enum(['bullet', 'blitz', 'rapid', 'classical']).optional(),
  })
  .openapi('StartReviewQueue')

export type StartReviewQueueBody = z.infer<typeof StartReviewQueueSchema>

const reviewQueueState = {
  description: 'The queue now',
  content: { 'application/json': { schema: ReviewQueueSchema } },
}

export const reviewQueueRoute = createRoute({
  method: 'get',
  path: '/library/review-queue',
  tags: ['library'],
  summary: 'How the review of the user’s recent games is going',
  responses: { 200: reviewQueueState },
})

export const startReviewQueueRoute = createRoute({
  method: 'post',
  path: '/library/review-queue',
  tags: ['library'],
  summary: 'Reviews the user’s last games on the server, newest first',
  description:
    'Takes the last `count` finished games (of one speed if given); those with a review take no time.',
  request: {
    body: { content: { 'application/json': { schema: StartReviewQueueSchema } }, required: true },
  },
  responses: {
    200: reviewQueueState,
    409: problem('A review run is going on'),
    503: unavailable,
  },
})

export const pauseReviewQueueRoute = createRoute({
  method: 'post',
  path: '/library/review-queue/pause',
  tags: ['library'],
  summary: 'Pauses the run; a paused run also stays paused after a restart',
  responses: { 200: reviewQueueState },
})

export const resumeReviewQueueRoute = createRoute({
  method: 'post',
  path: '/library/review-queue/resume',
  tags: ['library'],
  summary: 'Goes on with a paused run',
  responses: { 200: reviewQueueState },
})

const PuzzleSchema = z.object({
  line: z.object({ startFen: z.string(), moves: z.array(z.string()) }),
  ply: z.number().int(),
  fen: z.string(),
  color: z.enum(['white', 'black']),
  played: z.string(),
  verdict: z.string(),
  best: z.object({ move: z.string(), uci: z.string(), line: z.string() }),
  /** Why `best` is better, from the coach's walkthrough of the game, when it covers the move. */
  explanation: z.string().optional(),
  game: z.object({
    id: z.string(),
    opponent: z.string(),
    date: z.string(),
    opening: z.string().optional(),
  }),
})

export const TrainingSchema = z
  .object({
    /** The puzzles to do now, the newest game first. */
    due: z.array(PuzzleSchema),
    /** Missed ones that come back later. */
    waiting: z.number().int(),
    solved: z.number().int(),
  })
  .openapi('Training')

export type TrainingBody = z.infer<typeof TrainingSchema>
export type PuzzleBody = TrainingBody['due'][number]

export const TrainingResultSchema = z
  .object({
    startFen: z.string().max(100),
    moves: z.array(z.string().max(5)).min(1).max(1000),
    ply: z.number().int().min(1),
    solvedFirstTry: z.boolean(),
  })
  .openapi('TrainingResult')

export type TrainingResultBody = z.infer<typeof TrainingResultSchema>

export const trainingRoute = createRoute({
  method: 'get',
  path: '/training',
  tags: ['library'],
  summary: 'The puzzles from the user’s mistakes in their reviewed games',
  responses: {
    200: {
      description: 'What is due, and how many wait or are solved',
      content: { 'application/json': { schema: TrainingSchema } },
    },
    503: unavailable,
  },
})

export const trainingResultRoute = createRoute({
  method: 'post',
  path: '/training/results',
  tags: ['library'],
  summary: 'Keeps how a puzzle went: solved at the first try it is done, else it comes back',
  request: {
    body: { content: { 'application/json': { schema: TrainingResultSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Stored',
      content: { 'application/json': { schema: z.object({ stored: z.literal(true) }) } },
    },
    503: unavailable,
  },
})
