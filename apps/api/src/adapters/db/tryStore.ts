import type { CoachTryBody } from '@pawnia/contracts'
import type { GameLine } from '@pawnia/history'
import { and, eq } from 'drizzle-orm'
import type { Database } from './types'
import { lineHash } from './lineHash'
import { coachTries } from './schema'

export interface StoredTry {
  /** When the review it was judged by was made. */
  reviewedAt: string
  judged: CoachTryBody
}

/** The verdicts on tried moves in PostgreSQL, one per line, move and tried move. */
export class PostgresTryStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  async find(line: GameLine, ply: number, tried: string): Promise<StoredTry | undefined> {
    const [row] = await this.db
      .select()
      .from(coachTries)
      .where(
        and(
          eq(coachTries.lineHash, lineHash(line)),
          eq(coachTries.ply, ply),
          eq(coachTries.tried, tried),
        ),
      )
    return row && { reviewedAt: row.reviewedAt.toISOString(), judged: row.data }
  }

  async save(line: GameLine, ply: number, tried: string, stored: StoredTry): Promise<void> {
    const update = { reviewedAt: new Date(stored.reviewedAt), data: stored.judged }
    await this.db
      .insert(coachTries)
      .values({ lineHash: lineHash(line), ply, tried, ...update })
      .onConflictDoUpdate({
        target: [coachTries.lineHash, coachTries.ply, coachTries.tried],
        set: update,
      })
  }
}
