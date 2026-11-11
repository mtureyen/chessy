import { createRoute, z } from '@hono/zod-openapi'
import { ProblemSchema } from './problem'

const Results = z
  .tuple([z.number().int(), z.number().int(), z.number().int()])
  .openapi({ description: 'White wins, draws, Black wins' })

/** Per rating band of the games (the mean of both ratings). */
const BandStatsSchema = z
  .object({
    'under-1200': Results,
    '1200-1599': Results,
    '1600-1999': Results,
    '2000+': Results,
  })
  .openapi('BandStats')

const BandNumber = z.number()
const PerBand = z.object({
  'under-1200': BandNumber.optional(),
  '1200-1599': BandNumber.optional(),
  '1600-1999': BandNumber.optional(),
  '2000+': BandNumber.optional(),
})

const LibraryOpeningSummarySchema = z.object({
  id: z.string().openapi({ example: 'caro-kann' }),
  name: z.string().openapi({ example: 'Caro-Kann Defense' }),
  side: z.enum(['white', 'black']),
  group: z.enum(['white', 'vs-e4', 'vs-d4']),
  style: z.array(z.enum(['classical', 'solid', 'sharp', 'gambit', 'system'])),
  /** The defining moves, SAN. */
  main: z.string().openapi({ example: 'e4 c6' }),
  tags: z.object({
    lowElo: z.boolean().openapi({ description: 'Works at low–mid Elo' }),
    strong: z.boolean().openapi({ description: 'Strong players (2000+) choose it' }),
  }),
  numbers: z.object({
    score: PerBand.openapi({ description: 'The opening side’s score in percent' }),
    share: PerBand.openapi({ description: 'Games reaching the main position, per mille' }),
  }),
  lines: z.number().int().openapi({ description: 'Named lines' }),
  traps: z.number().int(),
})

export const OpeningLibrarySchema = z
  .object({
    /** Where the numbers come from. */
    source: z.string(),
    /** Games counted per band. */
    games: z.object({
      'under-1200': z.number().int(),
      '1200-1599': z.number().int(),
      '1600-1999': z.number().int(),
      '2000+': z.number().int(),
    }),
    openings: z.array(LibraryOpeningSummarySchema),
  })
  .openapi('OpeningLibrary')

export type OpeningLibraryBody = z.infer<typeof OpeningLibrarySchema>

const TrapSchema = z.object({
  /** SAN from the start to where the trap is, in this opening's order. */
  moves: z.string(),
  trapper: z.enum(['white', 'black']),
  /** Whether the user's side (the opening's) sets it, or must avoid it. */
  yours: z.boolean(),
  bait: z.string().openapi({ description: 'The move most players under 1600 make there' }),
  baitShare: z.number().openapi({ description: 'Its share under 1600, percent' }),
  trapperScore: z.number().openapi({ description: 'The trapper’s score after it under 1600' }),
  games: z.number().int(),
  loss: z.number().openapi({ description: 'Winning chance the bait gives away, by the engine' }),
  best: z.string().optional().openapi({ description: 'The engine’s move instead' }),
  punish: z.string().openapi({ description: 'How the trapper goes on' }),
})

export const LibraryOpeningSchema = LibraryOpeningSummarySchema.omit({ lines: true, traps: true })
  .extend({
    tree: z.array(
      z.object({
        moves: z.array(z.string()),
        name: z.string().optional(),
        eco: z.string().optional(),
        stats: BandStatsSchema,
      }),
    ),
    traps: z.array(TrapSchema),
  })
  .openapi('LibraryOpening')

export type LibraryOpeningBody = z.infer<typeof LibraryOpeningSchema>

export const LibraryPositionSchema = z
  .object({ moves: z.array(z.object({ san: z.string(), stats: BandStatsSchema })) })
  .openapi('LibraryPosition')

export type LibraryPositionBody = z.infer<typeof LibraryPositionSchema>

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ProblemSchema } },
})

export const openingLibraryRoute = createRoute({
  method: 'get',
  path: '/opening-library',
  tags: ['openings'],
  summary: 'The opening library: openings to study for White and Black',
  responses: {
    200: {
      description: 'The openings',
      content: { 'application/json': { schema: OpeningLibrarySchema } },
    },
  },
})

export const libraryOpeningRoute = createRoute({
  method: 'get',
  path: '/opening-library/{id}',
  tags: ['openings'],
  summary: 'One opening of the library: its named lines as a tree with real games, and traps',
  request: { params: z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/) }) },
  responses: {
    200: {
      description: 'The opening',
      content: { 'application/json': { schema: LibraryOpeningSchema } },
    },
    404: problem('No such opening in the library'),
  },
})

export const libraryPositionRoute = createRoute({
  method: 'get',
  path: '/opening-library/position',
  tags: ['openings'],
  summary: 'What real games played in a position of the library, per rating band',
  request: {
    query: z.object({
      moves: z
        .string()
        .max(200)
        .default('')
        .openapi({ example: 'e4,c6', description: 'SAN from the start, comma-separated' }),
    }),
  },
  responses: {
    200: {
      description: 'The moves played',
      content: { 'application/json': { schema: LibraryPositionSchema } },
    },
    404: problem('The position is not in the library'),
  },
})
