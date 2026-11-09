import type { GameLine, PuzzleProgress } from '@pawnia/history'
import type { Database } from './types'
import { lineHash } from './lineHash'
import { trainingProgress } from './schema'

/** The user's progress with their puzzles in PostgreSQL. */
export class PostgresTrainingStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  /** Every puzzle's progress, by `progressKey`. */
  async all(): Promise<Map<string, PuzzleProgress>> {
    const rows = await this.db.select().from(trainingProgress)
    return new Map(
      rows.map((row) => [
        `${row.lineHash}:${row.ply}`,
        {
          misses: row.misses,
          ...(row.dueAt && { dueAt: row.dueAt.toISOString() }),
        },
      ]),
    )
  }

  async save(line: GameLine, ply: number, progress: PuzzleProgress): Promise<void> {
    const update = {
      misses: progress.misses,
      dueAt: progress.dueAt ? new Date(progress.dueAt) : null,
    }
    await this.db
      .insert(trainingProgress)
      .values({ lineHash: lineHash(line), ply, ...update })
      .onConflictDoUpdate({
        target: [trainingProgress.lineHash, trainingProgress.ply],
        set: update,
      })
  }
}

/** The key of a puzzle in `all`. */
export function progressKey(line: GameLine, ply: number): string {
  return `${lineHash(line)}:${ply}`
}
