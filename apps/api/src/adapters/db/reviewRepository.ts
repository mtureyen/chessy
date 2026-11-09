import type { GameLine, ReviewRepository, StoredReview } from '@pawnia/history'
import { eq, sql } from 'drizzle-orm'
import type { Database } from './types'
import { lineHash } from './lineHash'
import { games, reviewMoves, reviews } from './schema'

/** Finished reviews in PostgreSQL, one per main line, with a row per move for statistics. */
export class PostgresReviewRepository implements ReviewRepository {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  async save({ line, review, reviewedAt }: StoredReview): Promise<void> {
    const hash = lineHash(line)
    const row = {
      lineHash: hash,
      startFen: line.startFen,
      moves: [...line.moves],
      engine: review.settings.engine,
      nodes: review.settings.nodes,
      accuracyWhite: review.accuracy.white ?? null,
      accuracyBlack: review.accuracy.black ?? null,
      reviewedAt: new Date(reviewedAt),
      data: review,
    }
    await this.db.transaction(async (tx) => {
      const { lineHash: _key, ...update } = row
      await tx
        .insert(reviews)
        .values(row)
        .onConflictDoUpdate({ target: reviews.lineHash, set: update })
      await tx.delete(reviewMoves).where(eq(reviewMoves.lineHash, hash))
      if (review.moves.length === 0) return
      await tx.insert(reviewMoves).values(
        review.moves.map((move) => ({
          lineHash: hash,
          ply: move.ply,
          color: move.color,
          san: move.san,
          uci: move.uci,
          classification: move.classification,
          winBefore: move.winBefore,
          winAfter: move.winAfter,
          accuracy: move.accuracy,
          bestUci: move.best?.uci ?? null,
        })),
      )
    })
  }

  async find(line: GameLine): Promise<StoredReview | undefined> {
    const [row] = await this.db
      .select()
      .from(reviews)
      .where(eq(reviews.lineHash, lineHash(line)))
    return row && toStored(row)
  }

  async forGame(gameId: string): Promise<StoredReview | undefined> {
    const [row] = await this.db
      .select({ review: reviews })
      .from(games)
      .innerJoin(reviews, eq(reviews.lineHash, games.lineHash))
      .where(eq(games.id, gameId))
    return row && toStored(row.review)
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ count: sql<number>`count(*)::int` }).from(reviews)
    return row?.count ?? 0
  }
}

function toStored(row: typeof reviews.$inferSelect): StoredReview {
  return {
    line: { startFen: row.startFen, moves: row.moves },
    review: row.data,
    reviewedAt: row.reviewedAt.toISOString(),
  }
}
