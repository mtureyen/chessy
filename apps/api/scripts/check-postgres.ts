/**
 * Checks the database adapters against a real PostgreSQL through Bun's client, which the unit
 * tests can't (they run on PGlite under Node): games, reviews, the profile and what the coach
 * wrote must come back unchanged and be stored as JSON objects, not strings, and the history's
 * queries must read them.
 *
 *   DATABASE_URL=postgres://pawnia:pawnia@localhost:5433/pawnia bun run db:check
 *
 * Writes rows under fresh ids and deletes them again, so it is safe on a database in use.
 */
import { deepEquals } from 'bun'
import { sampleReview } from '@pawnia/history/testing'
import { sampleGame } from '@pawnia/library/testing'
import { eq, inArray, sql } from 'drizzle-orm'
import { openDatabase } from '../src/adapters/db/database'
import { PostgresGameRepository } from '../src/adapters/db/gameRepository'
import { PostgresGameHistory } from '../src/adapters/db/gameHistory'
import { PostgresGuideStore } from '../src/adapters/db/guideStore'
import { lineHash } from '../src/adapters/db/lineHash'
import { PostgresProfileStore } from '../src/adapters/db/profileStore'
import { PostgresRepertoireStore } from '../src/adapters/db/repertoireStore'
import { PostgresReviewRepository } from '../src/adapters/db/reviewRepository'
import {
  coachTries,
  games,
  openingGuides,
  openingLineNotes,
  profiles,
  repertoireLines,
  reviews,
  walkthroughs,
} from '../src/adapters/db/schema'
import { PostgresTrainingStore, progressKey } from '../src/adapters/db/trainingStore'
import { PostgresTryStore } from '../src/adapters/db/tryStore'
import { PostgresWalkthroughStore } from '../src/adapters/db/walkthroughStore'

const url = process.env.DATABASE_URL
if (!url || url.startsWith('pglite:')) throw new Error('Set DATABASE_URL to a PostgreSQL server')

const { db, close } = await openDatabase(url)
const run = crypto.randomUUID()
const game = sampleGame({ id: `check-${run}`, externalId: `check-${run}` })
// A line of its own, so the check never replaces a real review, and a game with that line.
const ending = '8/8/8/8/8/2k5/1q6/4K3 b - - 0 1'
const review = sampleReview(
  { startFen: ending, moves: ['b2b1'] },
  { positions: [{ fen: ending, score: { type: 'mate', winner: 'black', moves: 1 }, whiteWin: 0 }] },
)
const reviewed = sampleGame({
  id: `check-reviewed-${run}`,
  externalId: `check-reviewed-${run}`,
  pgn: `[SetUp "1"]\n[FEN "${ending}"]\n\n1... Qb1# 0-1`,
})
const profile = {
  id: `check-${run}`,
  displayName: 'check',
  accounts: [],
  createdAt: '2000-01-01T00:00:00.000Z',
  // Older than any real profile, so the app's "latest profile" stays the user's.
  updatedAt: '2000-01-01T00:00:00.000Z',
}
// An opening the library doesn't have, and a line nobody keeps: nothing real is replaced.
const openingId = `check-${run}`
const repertoireLine = {
  id: crypto.randomUUID(),
  side: 'black' as const,
  title: 'check',
  moves: ['h3', 'a6', 'h4', 'a5', 'Rh3', 'Ra6'],
  source: 'library' as const,
  level: 0,
  dueAt: '2026-11-07T12:00:00.000Z',
  addedAt: '2026-11-06T12:00:00.000Z',
}
const failures: string[] = []
const check = (what: string, ok: boolean) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`)
  if (!ok) failures.push(what)
}

try {
  const gameRepo = new PostgresGameRepository(db)
  await gameRepo.saveAll([game, reviewed])
  check('a game comes back unchanged', deepEquals(await gameRepo.get(game.id), game))

  const reviewRepo = new PostgresReviewRepository(db)
  await reviewRepo.save(review)
  check('a review comes back unchanged', deepEquals(await reviewRepo.find(review.line), review))

  await new PostgresProfileStore(db).save(profile)

  const history = new PostgresGameHistory(db)
  const summary = (await history.summaries()).find((s) => s.id === reviewed.id)
  check(
    'the history lists a reviewed game with its accuracy',
    summary?.reviewed === true && summary.accuracy?.white === 100,
  )
  const moves = (await history.reviewedMoves()).filter((m) => m.gameId === reviewed.id)
  check(
    'the history reads reviewed moves with the pieces on the board',
    deepEquals(moves, [
      { gameId: reviewed.id, ply: 1, color: 'white', classification: 'best', pieces: 1 },
    ]),
  )

  const walkthrough = {
    reviewedAt: '2026-11-06T12:00:00.000Z',
    walkthrough: {
      summary: 'check',
      moments: [],
      focus: 'check',
      agent: 'check',
      writtenAt: '2026-11-06T12:00:00.000Z',
    },
  }
  const store = new PostgresWalkthroughStore(db)
  await store.save(review.line, 'white', walkthrough)
  check(
    'a walkthrough comes back unchanged',
    deepEquals(await store.find(review.line, 'white'), walkthrough),
  )

  const progress = new PostgresTrainingStore(db)
  await progress.save(review.line, 1, { misses: 1, dueAt: '2026-11-07T12:00:00.000Z' })
  check(
    'a puzzle keeps its progress',
    deepEquals((await progress.all()).get(progressKey(review.line, 1)), {
      misses: 1,
      dueAt: '2026-11-07T12:00:00.000Z',
    }),
  )

  const judged = { verdict: 'wrong' as const, san: 'Qb1#', fen: ending, comment: 'check' }
  const tried = { reviewedAt: '2026-11-06T12:00:00.000Z', judged }
  const tries = new PostgresTryStore(db)
  await tries.save(review.line, 1, 'b2b1', tried)
  check(
    'a verdict on a tried move comes back unchanged',
    deepEquals(await tries.find(review.line, 1, 'b2b1'), tried),
  )

  const guides = new PostgresGuideStore(db)
  const noted = [{ ply: 1, san: 'e4', note: 'check', draw: { arrows: [], squares: [] } }]
  const written = { agent: 'check', writtenAt: '2026-11-06T12:00:00.000Z' }
  const guide = { story: 'check', ideas: 'check', opponents: 'check', moves: noted, ...written }
  await guides.save(openingId, guide)
  check('an opening guide comes back unchanged', deepEquals(await guides.find(openingId), guide))
  const notes = { moves: noted, ...written }
  await guides.saveLine(openingId, 'e4', notes)
  check(
    'the notes on a line come back unchanged',
    deepEquals(await guides.findLine(openingId, 'e4'), notes),
  )

  const repertoire = new PostgresRepertoireStore(db)
  await repertoire.add(repertoireLine)
  await repertoire.saveProgress(repertoireLine.id, {
    level: 1,
    dueAt: '2026-11-08T12:00:00.000Z',
  })
  check(
    'a repertoire line comes back with its progress',
    deepEquals(await repertoire.find(repertoireLine.id), {
      ...repertoireLine,
      level: 1,
      dueAt: '2026-11-08T12:00:00.000Z',
    }),
  )

  const types = await db.execute<{ table: string; type: string }>(sql`
    select 'games' as "table", jsonb_typeof(data) as type from ${games} where id = ${game.id}
    union all
    select 'reviews', jsonb_typeof(data) from ${reviews} where line_hash = ${lineHash(review.line)}
    union all
    select 'profiles', jsonb_typeof(data) from ${profiles} where id = ${profile.id}
    union all
    select 'walkthroughs', jsonb_typeof(data) from ${walkthroughs} where line_hash = ${lineHash(review.line)}
    union all
    select 'coach_tries', jsonb_typeof(data) from ${coachTries} where line_hash = ${lineHash(review.line)}
    union all
    select 'opening_guides', jsonb_typeof(data) from ${openingGuides} where opening_id = ${openingId}
    union all
    select 'opening_line_notes', jsonb_typeof(data) from ${openingLineNotes} where opening_id = ${openingId}`)
  check('every kind of row was found to look at', (types as unknown as unknown[]).length === 7)
  for (const row of types as unknown as { table: string; type: string }[]) {
    check(`${row.table}: data stored as a JSON object (${row.type})`, row.type === 'object')
  }
} finally {
  await db.delete(games).where(inArray(games.id, [game.id, reviewed.id]))
  await db.delete(reviews).where(inArray(reviews.lineHash, [lineHash(review.line)]))
  await db.delete(profiles).where(inArray(profiles.id, [profile.id]))
  await db.delete(openingGuides).where(eq(openingGuides.openingId, openingId))
  await db.delete(openingLineNotes).where(eq(openingLineNotes.openingId, openingId))
  await db.delete(repertoireLines).where(eq(repertoireLines.id, repertoireLine.id))
  await close()
}
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed`)
  process.exit(1)
}
