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

const GuideColor = z.enum(['green', 'red', 'blue', 'yellow'])

/** The idea of a move as a picture on the position after it: arrows and marked squares. */
export const GuideDrawingSchema = z
  .object({
    arrows: z.array(z.object({ from: z.string(), to: z.string(), color: GuideColor })),
    squares: z.array(z.object({ square: z.string(), color: GuideColor })),
  })
  .openapi('GuideDrawing')

/** A move with the coach's note on it. */
const NotedMoveSchema = z.object({
  ply: z.number().int(),
  san: z.string(),
  note: z.string(),
  /** Where the coach drew the move's idea. */
  draw: GuideDrawingSchema.optional(),
})

export const OpeningGuideSchema = z
  .object({
    /** Where the name comes from and the history (Markdown). */
    story: z.string(),
    /** The plans, structures and piece placement for the opening's side (Markdown). */
    ideas: z.string(),
    /** What the other side tries and how to handle it, with the traps (Markdown). */
    opponents: z.string(),
    /** The main line, move by move. */
    moves: z.array(NotedMoveSchema),
    agent: z.string().openapi({ description: 'The coach that wrote it' }),
    writtenAt: z.string().datetime(),
  })
  .openapi('OpeningGuide')

export type OpeningGuideBody = z.infer<typeof OpeningGuideSchema>

const guideParams = z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/) })

export const openingGuideRoute = createRoute({
  method: 'get',
  path: '/opening-library/{id}/guide',
  tags: ['openings'],
  summary: 'The coach’s study guide of an opening, if one was written',
  request: { params: guideParams },
  responses: {
    200: {
      description: 'The guide',
      content: { 'application/json': { schema: OpeningGuideSchema } },
    },
    404: problem('No such opening, or no guide written yet'),
    503: problem('No game database on this server'),
  },
})

export const writeOpeningGuideRoute = createRoute({
  method: 'post',
  path: '/opening-library/{id}/guide',
  tags: ['openings'],
  summary: 'Has the coach write an opening’s study guide (kept; written once unless asked again)',
  description:
    'The story and name, the ideas, what opponents try, and a note per move of the main line, written from the library’s facts with no tools. Costs one model turn with the Claude API.',
  request: {
    params: guideParams,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            agent: z.string().max(50).optional(),
            /** Write it again even when one is kept. */
            regenerate: z.boolean().optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'The guide',
      content: { 'application/json': { schema: OpeningGuideSchema } },
    },
    404: problem('No such opening, or no such agent'),
    502: problem('The coach gave no usable guide'),
    503: problem('No coach available, or no game database'),
  },
})

/** The coach's notes on one line of an opening, move by move. */
export const LineNotesSchema = z
  .object({
    moves: z.array(NotedMoveSchema),
    agent: z.string().openapi({ description: 'The coach that wrote them' }),
    writtenAt: z.string().datetime(),
  })
  .openapi('LineNotes')

export type LineNotesBody = z.infer<typeof LineNotesSchema>

export const lineNotesRoute = createRoute({
  method: 'get',
  path: '/opening-library/{id}/line-notes',
  tags: ['openings'],
  summary: 'The coach’s notes on one line of an opening, if they were written',
  request: {
    params: guideParams,
    query: z.object({
      moves: z.string().min(1).max(300).openapi({
        example: 'e4,c6,Bc4',
        description: 'The line: SAN from the start, comma-separated',
      }),
    }),
  },
  responses: {
    200: {
      description: 'The notes',
      content: { 'application/json': { schema: LineNotesSchema } },
    },
    400: problem('A move of the line is not legal'),
    404: problem('No notes on this line yet'),
    503: problem('No game database on this server'),
  },
})

export const writeLineNotesRoute = createRoute({
  method: 'post',
  path: '/opening-library/{id}/line-notes',
  tags: ['openings'],
  summary:
    'Has the coach write notes on one line of an opening (kept; written once unless asked again)',
  description:
    'A note for every move of the line, with a drawing where it helps, written from the library’s facts about the line with no tools. Costs one model turn with the Claude API.',
  request: {
    params: guideParams,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            /** The line: SAN from the start. */
            moves: z.array(z.string().min(2).max(8)).min(2).max(30),
            agent: z.string().max(50).optional(),
            /** Write them again even when they are kept. */
            regenerate: z.boolean().optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'The notes',
      content: { 'application/json': { schema: LineNotesSchema } },
    },
    400: problem('A move of the line is not legal'),
    404: problem('No such opening, or no such agent'),
    502: problem('The coach gave no usable notes'),
    503: problem('No coach available, or no game database'),
  },
})
