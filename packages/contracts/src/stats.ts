import { createRoute, z } from '@hono/zod-openapi'
import { ProblemSchema } from './problem'
import { PlayerProfileSchema, SourceIdSchema } from './sources'

const TallySchema = z
  .object({
    games: z.number().int(),
    wins: z.number().int(),
    draws: z.number().int(),
    losses: z.number().int(),
    unfinished: z.number().int(),
    score: z.number().optional().openapi({ description: 'Points per game in percent' }),
  })
  .openapi('Tally')

const SpeedSchema = z.enum([
  'ultrabullet',
  'bullet',
  'blitz',
  'rapid',
  'classical',
  'correspondence',
  'unlimited',
])

const EndReasonSchema = z.enum([
  'checkmate',
  'resignation',
  'time',
  'abandoned',
  'agreement',
  'repetition',
  'stalemate',
  'insufficient-material',
  'fifty-move-rule',
  'timeout-vs-insufficient',
  'other',
])

const EndingCountSchema = z.object({ reason: EndReasonSchema, games: z.number().int() })

const OpeningStatsSchema = z.object({
  family: z.string().openapi({ example: 'Sicilian Defense' }),
  tally: TallySchema,
  variations: z.array(z.object({ name: z.string(), tally: TallySchema })),
})

const RepertoireLineSchema = z
  .object({
    moves: z
      .array(z.string())
      .openapi({ example: ['e4', 'c5'], description: 'From the start, in SAN' }),
    tally: TallySchema,
    opening: z.string().optional().openapi({ description: 'The most played opening family' }),
  })
  .openapi('RepertoireLine')

const ErrorCountsSchema = z.object({
  inaccuracy: z.number(),
  mistake: z.number(),
  miss: z.number(),
  blunder: z.number(),
})

const PhaseQualitySchema = z.object({ moves: z.number().int(), errors: ErrorCountsSchema })

const MoveQualitySchema = z
  .object({
    reviewedGames: z.number().int(),
    averageAccuracy: z.number().optional(),
    phases: z.object({
      opening: PhaseQualitySchema,
      middlegame: PhaseQualitySchema,
      endgame: PhaseQualitySchema,
    }),
    errorsPerGame: ErrorCountsSchema,
    accuracy: z
      .array(z.object({ at: z.string().datetime(), accuracy: z.number() }))
      .openapi({ description: 'The player’s accuracy per reviewed game, oldest first' }),
  })
  .openapi('MoveQuality')

const StatsGameRowSchema = z.object({
  id: z.string(),
  url: z.string().url().optional(),
  playedAt: z.string().datetime(),
  speed: SpeedSchema,
  side: z.enum(['white', 'black']),
  outcome: z.enum(['win', 'loss', 'draw', 'unfinished']),
  opponent: z.object({ name: z.string(), rating: z.number().int().optional() }),
  opening: z.string().optional(),
  end: EndReasonSchema.optional(),
  moves: z.number().int().optional().openapi({ description: 'Length in full moves' }),
})

export const PlayerStatsSchema = z
  .object({
    player: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('me'),
        displayName: z.string(),
        accounts: z.array(z.object({ source: SourceIdSchema, username: z.string() })),
      }),
      z.object({ kind: z.literal('lookup'), profile: PlayerProfileSchema }),
    ]),
    window: z.object({
      last: z.number().int().openapi({ description: 'How many games were asked for' }),
      speed: SpeedSchema.optional(),
      found: z.number().int().openapi({ description: 'How many games count' }),
      since: z
        .string()
        .datetime()
        .optional()
        .openapi({ description: 'Lookups: the oldest day read' }),
      more: z
        .boolean()
        .optional()
        .openapi({ description: 'Lookups: older games were left unread' }),
    }),
    record: TallySchema,
    ratings: z.array(
      z.object({
        category: z.enum(['chesscom', 'lichess', 'bot', 'local']),
        speed: SpeedSchema,
        points: z.array(z.object({ at: z.string().datetime(), rating: z.number().int() })),
      }),
    ),
    openings: z.object({ white: z.array(OpeningStatsSchema), black: z.array(OpeningStatsSchema) }),
    repertoire: z.object({
      white: z.array(RepertoireLineSchema),
      black: z.array(RepertoireLineSchema),
    }),
    endings: z.object({
      wins: z.array(EndingCountSchema),
      draws: z.array(EndingCountSchema),
      losses: z.array(EndingCountSchema),
      averageMoves: z.number().optional(),
    }),
    opponents: z.array(z.object({ key: z.string(), tally: TallySchema })),
    activity: z.object({
      timeZone: z.string(),
      dayParts: z.array(
        z.object({ key: z.enum(['night', 'morning', 'afternoon', 'evening']), tally: TallySchema }),
      ),
      weekdays: z.array(
        z.object({
          key: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
          tally: TallySchema,
        }),
      ),
    }),
    quality: MoveQualitySchema.optional().openapi({
      description: 'Own stats only: from the reviewed games among these',
    }),
    games: z.array(StatsGameRowSchema),
  })
  .openapi('PlayerStats')

export type PlayerStatsBody = z.infer<typeof PlayerStatsSchema>

const isTimeZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const query = (defaultLast: number) =>
  z.object({
    last: z.coerce
      .number()
      .int()
      .min(1)
      .max(300)
      .default(defaultLast)
      .openapi({ description: 'The newest this many finished games' }),
    speed: SpeedSchema.optional(),
    tz: z
      .string()
      .refine(isTimeZone, 'an IANA time zone like Europe/Berlin')
      .default('UTC')
      .openapi({ example: 'Europe/Berlin', description: 'For times of day and weekdays' }),
  })

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ProblemSchema } },
})

const ok = {
  description: 'The statistics',
  content: { 'application/json': { schema: PlayerStatsSchema } },
}

export const myStatsRoute = createRoute({
  method: 'get',
  path: '/stats/me',
  tags: ['stats'],
  summary: 'Statistics over the user’s own recent games',
  description:
    'From the stored history, on all linked chess.com and lichess accounts; move quality from the reviewed games among them.',
  request: { query: query(30) },
  responses: {
    200: ok,
    400: problem('Invalid last, speed or time zone'),
    503: problem('No game database on this server'),
  },
})

export const playerStatsRoute = createRoute({
  method: 'get',
  path: '/stats/players/{source}/{username}',
  tags: ['stats'],
  summary: 'Statistics over anyone’s recent games on lichess or chess.com',
  description:
    'Read live from the platform (at most 12 months back), not stored; cached for a few minutes.',
  request: {
    params: z.object({
      source: SourceIdSchema,
      username: z
        .string()
        .regex(/^[A-Za-z0-9_-]{2,30}$/)
        .openapi({ example: 'DrNykterstein' }),
    }),
    query: query(100),
  },
  responses: {
    200: ok,
    400: problem('Invalid source, username, last, speed or time zone'),
    404: problem('The user does not exist on that platform'),
    429: problem('The platform asked us to slow down; see Retry-After'),
    502: problem('The platform could not be reached or failed'),
  },
})
