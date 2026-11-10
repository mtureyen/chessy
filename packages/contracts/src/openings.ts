import { createRoute, z } from '@hono/zod-openapi'
import { ProblemSchema } from './problem'

const TallySchema = z.object({
  games: z.number().int(),
  wins: z.number().int(),
  draws: z.number().int(),
  losses: z.number().int(),
  unfinished: z.number().int(),
  score: z.number().optional(),
})

const ColorSchema = z.enum(['white', 'black'])

const DeparturesSchema = z
  .object({
    you: z.number().int().openapi({ description: 'Games where the player left theory first' }),
    them: z.number().int().openapi({ description: 'Games where the opponent did' }),
    none: z.number().int().openapi({ description: 'Games that stayed in theory' }),
    youAt: z
      .number()
      .int()
      .optional()
      .openapi({ description: 'Median move number at which the player left theory' }),
  })
  .openapi('Departures')

const OpeningOverviewSchema = z.object({
  color: ColorSchema,
  family: z.string().openapi({ example: 'Vienna Game' }),
  tally: TallySchema,
  departures: DeparturesSchema,
})

const WindowSchema = z.object({
  last: z.number().int(),
  speed: z.string().optional(),
  found: z.number().int().openapi({ description: 'Games looked at' }),
})

export const OpeningsSchema = z
  .object({ window: WindowSchema, openings: z.array(OpeningOverviewSchema) })
  .openapi('Openings')

export type OpeningsBody = z.infer<typeof OpeningsSchema>

const DepartureSchema = z.object({
  ply: z.number().int(),
  san: z.string(),
  theory: z.array(z.string()).openapi({ description: 'What theory had instead (SAN)' }),
})

export const OpeningSchema = z
  .object({
    window: WindowSchema,
    color: ColorSchema,
    family: z.string(),
    tally: TallySchema,
    departures: DeparturesSchema,
    lines: z.array(
      z.object({
        moves: z.array(z.string()).openapi({ example: ['e4', 'e5', 'Nc3'] }),
        tally: TallySchema,
        book: z.boolean().openapi({ description: 'Theory knows the position after the move' }),
        yours: z.boolean().openapi({ description: 'The player made the move' }),
        theory: z
          .array(z.string())
          .optional()
          .openapi({ description: 'When this move left theory: the moves theory had instead' }),
      }),
    ),
    games: z.array(
      z.object({
        id: z.string(),
        url: z.string().url().optional(),
        playedAt: z.string().datetime(),
        outcome: z.enum(['win', 'loss', 'draw', 'unfinished']),
        opponent: z.object({ name: z.string(), rating: z.number().int().optional() }),
        left: DepartureSchema.extend({ by: z.enum(['you', 'them']) }).optional(),
      }),
    ),
    after: z
      .object({
        reviewedGames: z.number().int(),
        win: z
          .number()
          .optional()
          .openapi({ description: 'Mean winning chance (0–100) after move 12' }),
        errorsPerGame: z.number().openapi({ description: 'Errors in the first 10 moves' }),
      })
      .openapi({ description: 'From the reviewed games among these' }),
  })
  .openapi('Opening')

export type OpeningBody = z.infer<typeof OpeningSchema>

const query = z.object({
  last: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(300)
    .openapi({ description: 'The newest this many finished platform games' }),
  speed: z.enum(['bullet', 'blitz', 'rapid', 'classical']).optional(),
})

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ProblemSchema } },
})

export const openingsRoute = createRoute({
  method: 'get',
  path: '/training/openings',
  tags: ['library'],
  summary: 'The user’s openings per colour, worst first, with where they leave theory',
  request: { query },
  responses: {
    200: {
      description: 'The openings',
      content: { 'application/json': { schema: OpeningsSchema } },
    },
    503: problem('No game database or no opening book on this server'),
  },
})

export const openingRoute = createRoute({
  method: 'get',
  path: '/training/openings/{color}',
  tags: ['library'],
  summary: 'One opening of the user’s with one colour: lines, theory, games',
  request: {
    params: z.object({ color: ColorSchema }),
    query: query.extend({
      family: z.string().min(1).max(100).openapi({ example: 'Vienna Game' }),
    }),
  },
  responses: {
    200: {
      description: 'The opening',
      content: { 'application/json': { schema: OpeningSchema } },
    },
    404: problem('The user has no games in this opening with this colour'),
    503: problem('No game database or no opening book on this server'),
  },
})
