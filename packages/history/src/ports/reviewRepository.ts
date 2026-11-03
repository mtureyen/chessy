import type { GameReview } from '@chessy/analysis'
import type { GameLine } from '../domain/line'

export interface StoredReview {
  line: GameLine
  review: GameReview
  /** ISO timestamp. */
  reviewedAt: string
}

/** Port: finished game reviews, kept per line (the server's database). */
export interface ReviewRepository {
  /** Keeps the review of a line, replacing an older one of the same line. */
  save(review: StoredReview): Promise<void>
  find(line: GameLine): Promise<StoredReview | undefined>
  /** The review of a stored game's main line, if there is one. */
  forGame(gameId: string): Promise<StoredReview | undefined>
  count(): Promise<number>
}
