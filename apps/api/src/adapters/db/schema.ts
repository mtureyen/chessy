import type { GameReview } from '@chessy/analysis'
import type { LibraryGame, Profile } from '@chessy/library'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * The server's copy of the game history. `data` holds each game and review exactly as the app
 * sent it; the other columns are copies for querying. After a change: `bun run db:generate`
 * writes the migration to apps/api/drizzle/ (applied on start).
 */
export const games = pgTable(
  'games',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
    whiteName: text('white_name').notNull(),
    whiteRating: integer('white_rating'),
    blackName: text('black_name').notNull(),
    blackRating: integer('black_rating'),
    result: text('result').notNull(),
    speed: text('speed').notNull(),
    rated: boolean('rated').notNull(),
    openingEco: text('opening_eco'),
    openingName: text('opening_name'),
    /** SHA-256 of the main line (see lineText), to find the game's review. */
    lineHash: text('line_hash').notNull(),
    data: jsonb('data').$type<LibraryGame>().notNull(),
  },
  (t) => [
    uniqueIndex('games_source_external_id').on(t.source, t.externalId),
    index('games_played_at').on(t.playedAt),
    index('games_line_hash').on(t.lineHash),
  ],
)

export const reviews = pgTable('reviews', {
  /** SHA-256 of the reviewed main line: one review per line, the latest. */
  lineHash: text('line_hash').primaryKey(),
  startFen: text('start_fen').notNull(),
  moves: text('moves').array().notNull(),
  engine: text('engine').notNull(),
  nodes: integer('nodes').notNull(),
  accuracyWhite: real('accuracy_white'),
  accuracyBlack: real('accuracy_black'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull(),
  data: jsonb('data').$type<GameReview>().notNull(),
})

/** One row per reviewed move, for statistics across games. */
export const reviewMoves = pgTable(
  'review_moves',
  {
    lineHash: text('line_hash')
      .notNull()
      .references(() => reviews.lineHash, { onDelete: 'cascade' }),
    ply: integer('ply').notNull(),
    color: text('color').notNull(),
    san: text('san').notNull(),
    uci: text('uci').notNull(),
    classification: text('classification').notNull(),
    winBefore: real('win_before').notNull(),
    winAfter: real('win_after').notNull(),
    accuracy: real('accuracy').notNull(),
    bestUci: text('best_uci'),
  },
  (t) => [
    primaryKey({ columns: [t.lineHash, t.ply] }),
    index('review_moves_classification').on(t.classification),
  ],
)

/** The user's profile; one row per installation for now, keyed by id for more later. */
export const profiles = pgTable('profiles', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  data: jsonb('data').$type<Profile>().notNull(),
})
