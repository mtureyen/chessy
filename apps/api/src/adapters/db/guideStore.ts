import type { LineNotesBody, OpeningGuideBody } from '@pawnia/contracts'
import { and, eq } from 'drizzle-orm'
import type { Database } from './types'
import { openingGuides, openingLineNotes } from './schema'

/** The coach's opening guides in PostgreSQL, one per opening, and its notes on single lines. */
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

  /** The notes on one line of an opening (its SAN moves, space-separated). */
  async findLine(openingId: string, moves: string): Promise<LineNotesBody | undefined> {
    const [row] = await this.db
      .select({ data: openingLineNotes.data })
      .from(openingLineNotes)
      .where(and(eq(openingLineNotes.openingId, openingId), eq(openingLineNotes.moves, moves)))
    return row?.data
  }

  async saveLine(openingId: string, moves: string, notes: LineNotesBody): Promise<void> {
    const update = { writtenAt: new Date(notes.writtenAt), data: notes }
    await this.db
      .insert(openingLineNotes)
      .values({ openingId, moves, ...update })
      .onConflictDoUpdate({
        target: [openingLineNotes.openingId, openingLineNotes.moves],
        set: update,
      })
  }
}
