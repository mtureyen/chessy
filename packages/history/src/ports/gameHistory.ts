import type { GameSummary } from '../domain/playerGames'
import type { ReviewedMoveRow } from '../domain/stats'

/** Port: the stored history read for searching and statistics (the server's database). */
export interface GameHistory {
  /** Every stored game without its moves, newest first. */
  summaries(): Promise<GameSummary[]>
  /** Every move of the stored games that have a review. */
  reviewedMoves(): Promise<ReviewedMoveRow[]>
}
