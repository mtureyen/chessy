import type { MoveClass } from '@pawnia/analysis'
import type { Color } from '@pawnia/chess'
import type { GameHistory, GameSummary, ReviewedMoveRow } from '@pawnia/history'
import type { GameOrigin, GameResult, GameSpeed } from '@pawnia/library'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import type { Database } from './types'
import { games, reviewMoves, reviews } from './schema'

/** The history in PostgreSQL, read without the moves: the coach's searches and statistics. */
export class PostgresGameHistory implements GameHistory {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  async summaries(): Promise<GameSummary[]> {
    const rows = await this.db
      .select({
        id: games.id,
        source: games.source,
        playedAt: games.playedAt,
        whiteName: games.whiteName,
        whiteRating: games.whiteRating,
        blackName: games.blackName,
        blackRating: games.blackRating,
        result: games.result,
        speed: games.speed,
        rated: games.rated,
        openingEco: games.openingEco,
        openingName: games.openingName,
        timeControl: sql<string | null>`${games.data}->>'timeControl'`,
        url: sql<string | null>`${games.data}->>'url'`,
        reviewed: sql<boolean>`${reviews.lineHash} is not null`,
        accuracyWhite: reviews.accuracyWhite,
        accuracyBlack: reviews.accuracyBlack,
      })
      .from(games)
      .leftJoin(reviews, eq(reviews.lineHash, games.lineHash))
      .orderBy(desc(games.playedAt))
    return rows.map((row) => {
      const accuracy = {
        ...(row.accuracyWhite !== null && { white: row.accuracyWhite }),
        ...(row.accuracyBlack !== null && { black: row.accuracyBlack }),
      }
      const opening = {
        ...(row.openingEco && { eco: row.openingEco }),
        ...(row.openingName && { name: row.openingName }),
      }
      return {
        id: row.id,
        source: row.source as GameOrigin,
        playedAt: row.playedAt.toISOString(),
        white: player(row.whiteName, row.whiteRating),
        black: player(row.blackName, row.blackRating),
        result: row.result as GameResult,
        speed: row.speed as GameSpeed,
        ...(row.timeControl && { timeControl: row.timeControl }),
        rated: row.rated,
        ...(Object.keys(opening).length > 0 && { opening }),
        ...(row.url && { url: row.url }),
        reviewed: row.reviewed,
        ...(Object.keys(accuracy).length > 0 && { accuracy }),
      }
    })
  }

  /** The PGNs of these stored games, by id (unknown ids left out). */
  async pgns(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const rows = await this.db
      .select({ id: games.id, pgn: sql<string>`${games.data}->>'pgn'` })
      .from(games)
      .where(inArray(games.id, [...ids]))
    return new Map(rows.map((row) => [row.id, row.pgn]))
  }

  async reviewedMoves(): Promise<ReviewedMoveRow[]> {
    // The position before move `ply` is positions[ply - 1] of the review; its piece letters
    // (queens, rooks, bishops, knights) tell the phase.
    const fenBefore = sql`${reviews.data}->'positions'->(${reviewMoves.ply} - 1)->>'fen'`
    const rows = await this.db
      .select({
        gameId: games.id,
        ply: reviewMoves.ply,
        color: reviewMoves.color,
        classification: reviewMoves.classification,
        pieces: sql<
          number | null
        >`length(regexp_replace(split_part(${fenBefore}, ' ', 1), '[^qrbnQRBN]', '', 'g'))::int`,
      })
      .from(games)
      .innerJoin(reviewMoves, eq(reviewMoves.lineHash, games.lineHash))
      .innerJoin(reviews, eq(reviews.lineHash, games.lineHash))
    return rows.map(({ pieces, ...row }) => ({
      ...row,
      color: row.color as Color,
      classification: row.classification as MoveClass,
      ...(pieces !== null && { pieces }),
    }))
  }
}

function player(name: string, rating: number | null) {
  return rating === null ? { name } : { name, rating }
}
