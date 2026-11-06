import type { CoachWalkthroughBody } from '@chessy/contracts'
import type { GameLine } from '@chessy/history'
import { and, eq } from 'drizzle-orm'
import type { Database } from './types'
import { lineHash } from './lineHash'
import { walkthroughs } from './schema'

export interface StoredWalkthrough {
  /** When the review it was written from was made. */
  reviewedAt: string
  walkthrough: CoachWalkthroughBody
}

/** The coach's walkthroughs in PostgreSQL, one per line and side. */
export class PostgresWalkthroughStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  async find(line: GameLine, side: string): Promise<StoredWalkthrough | undefined> {
    const [row] = await this.db
      .select()
      .from(walkthroughs)
      .where(and(eq(walkthroughs.lineHash, lineHash(line)), eq(walkthroughs.side, side)))
    return row && { reviewedAt: row.reviewedAt.toISOString(), walkthrough: row.data }
  }

  async save(line: GameLine, side: string, stored: StoredWalkthrough): Promise<void> {
    const update = { reviewedAt: new Date(stored.reviewedAt), data: stored.walkthrough }
    await this.db
      .insert(walkthroughs)
      .values({ lineHash: lineHash(line), side, ...update })
      .onConflictDoUpdate({ target: [walkthroughs.lineHash, walkthroughs.side], set: update })
  }
}
