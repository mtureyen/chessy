/**
 * Checks the database adapters against a real PostgreSQL through Bun's client, which the unit
 * tests can't (they run on PGlite under Node): games, reviews and the profile must come back
 * unchanged and be stored as JSON objects, not strings.
 *
 *   DATABASE_URL=postgres://chessy:chessy@localhost:5433/chessy bun run db:check
 *
 * Writes rows under fresh ids and deletes them again, so it is safe on a database in use.
 */
import { deepEquals } from 'bun'
import { sampleReview } from '@chessy/history/testing'
import { sampleGame } from '@chessy/library/testing'
import { inArray, sql } from 'drizzle-orm'
import { openDatabase } from '../src/adapters/db/database'
import { PostgresGameRepository } from '../src/adapters/db/gameRepository'
import { lineHash } from '../src/adapters/db/lineHash'
import { PostgresProfileStore } from '../src/adapters/db/profileStore'
import { PostgresReviewRepository } from '../src/adapters/db/reviewRepository'
import { games, profiles, reviews } from '../src/adapters/db/schema'

const url = process.env.DATABASE_URL
if (!url || url.startsWith('pglite:')) throw new Error('Set DATABASE_URL to a PostgreSQL server')

const { db, close } = await openDatabase(url)
const run = crypto.randomUUID()
const game = sampleGame({ id: `check-${run}`, externalId: `check-${run}` })
// A line of its own, so the check never replaces a real review.
const review = sampleReview({ startFen: '8/8/8/8/8/2k5/1q6/4K3 b - - 0 1', moves: ['b2b1'] })
const profile = {
  id: `check-${run}`,
  displayName: 'check',
  accounts: [],
  createdAt: '2000-01-01T00:00:00.000Z',
  // Older than any real profile, so the app's "latest profile" stays the user's.
  updatedAt: '2000-01-01T00:00:00.000Z',
}
const failures: string[] = []
const check = (what: string, ok: boolean) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`)
  if (!ok) failures.push(what)
}

try {
  const gameRepo = new PostgresGameRepository(db)
  await gameRepo.saveAll([game])
  check('a game comes back unchanged', deepEquals(await gameRepo.get(game.id), game))

  const reviewRepo = new PostgresReviewRepository(db)
  await reviewRepo.save(review)
  check('a review comes back unchanged', deepEquals(await reviewRepo.find(review.line), review))

  await new PostgresProfileStore(db).save(profile)

  const types = await db.execute<{ table: string; type: string }>(sql`
    select 'games' as "table", jsonb_typeof(data) as type from ${games} where id = ${game.id}
    union all
    select 'reviews', jsonb_typeof(data) from ${reviews} where line_hash = ${lineHash(review.line)}
    union all
    select 'profiles', jsonb_typeof(data) from ${profiles} where id = ${profile.id}`)
  for (const row of types as unknown as { table: string; type: string }[]) {
    check(`${row.table}: data stored as a JSON object (${row.type})`, row.type === 'object')
  }
} finally {
  await db.delete(games).where(inArray(games.id, [game.id]))
  await db.delete(reviews).where(inArray(reviews.lineHash, [lineHash(review.line)]))
  await db.delete(profiles).where(inArray(profiles.id, [profile.id]))
  await close()
}
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed`)
  process.exit(1)
}
