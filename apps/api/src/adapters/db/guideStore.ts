import type { OpeningGuideBody } from '@pawnia/contracts'
import { eq } from 'drizzle-orm'
import type { Database } from './types'
import { openingGuides } from './schema'

/** The coach's opening guides in PostgreSQL, one per opening. */
export class PostgresGuideStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  async find(openingId: string): Promise<OpeningGuideBody | undefined> {
    const [row] = await this.db
      .select({ data: openingGuides.data })
      .from(openingGuides)
      .where(eq(openingGuides.openingId, openingId))
    return row?.data
  }

  async save(openingId: string, guide: OpeningGuideBody): Promise<void> {
    const update = { writtenAt: new Date(guide.writtenAt), data: guide }
    await this.db
      .insert(openingGuides)
      .values({ openingId, ...update })
      .onConflictDoUpdate({ target: openingGuides.openingId, set: update })
  }
}
