import type { ReviewProgress } from '@pawnia/history'
import { and, asc, eq } from 'drizzle-orm'
import type { Database } from './types'
import { repertoireLines } from './schema'

/** A repertoire line as kept. */
export interface StoredRepertoireLine extends ReviewProgress {
  id: string
  side: 'white' | 'black'
  title: string
  moves: string[]
  openingId?: string
  source: 'library' | 'practice'
  addedAt: string
}

/** The user's repertoire in PostgreSQL. */
export class PostgresRepertoireStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  async list(): Promise<StoredRepertoireLine[]> {
    const rows = await this.db
      .select()
      .from(repertoireLines)
      .orderBy(asc(repertoireLines.dueAt), asc(repertoireLines.addedAt))
    return rows.map(toLine)
  }

  async find(id: string): Promise<StoredRepertoireLine | undefined> {
    const [row] = await this.db.select().from(repertoireLines).where(eq(repertoireLines.id, id))
    return row && toLine(row)
  }

  /** Adds the line, or returns the one kept with the same side and moves. */
  async add(line: StoredRepertoireLine): Promise<StoredRepertoireLine> {
    const moves = line.moves.join(' ')
    await this.db
      .insert(repertoireLines)
      .values({
        id: line.id,
        side: line.side,
        title: line.title,
        moves,
        openingId: line.openingId ?? null,
        source: line.source,
        level: line.level,
        dueAt: new Date(line.dueAt),
        addedAt: new Date(line.addedAt),
      })
      .onConflictDoNothing()
    const [row] = await this.db
      .select()
      .from(repertoireLines)
      .where(and(eq(repertoireLines.side, line.side), eq(repertoireLines.moves, moves)))
    return toLine(row!)
  }

  async remove(id: string): Promise<boolean> {
    const removed = await this.db
      .delete(repertoireLines)
      .where(eq(repertoireLines.id, id))
      .returning({ id: repertoireLines.id })
    return removed.length > 0
  }

  async saveProgress(id: string, { level, dueAt }: ReviewProgress): Promise<void> {
    await this.db
      .update(repertoireLines)
      .set({ level, dueAt: new Date(dueAt) })
      .where(eq(repertoireLines.id, id))
  }
}

function toLine(row: typeof repertoireLines.$inferSelect): StoredRepertoireLine {
  return {
    id: row.id,
    side: row.side as StoredRepertoireLine['side'],
    title: row.title,
    moves: row.moves.split(' '),
    ...(row.openingId && { openingId: row.openingId }),
    source: row.source as StoredRepertoireLine['source'],
    level: row.level,
    dueAt: row.dueAt.toISOString(),
    addedAt: row.addedAt.toISOString(),
  }
}
