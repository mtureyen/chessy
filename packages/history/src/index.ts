/** History context: the user's finished games and reviews, kept for the coach and statistics. */
export { gameLine, lineText, type GameLine } from './domain/line'
export {
  filterGames,
  playerGames,
  type GameFilter,
  type GameSummary,
  type PlayerGame,
  type PlayerOutcome,
} from './domain/playerGames'
export {
  groupGames,
  moveQuality,
  openingFamily,
  phaseOf,
  ratingTrends,
  tally,
  type GamePhase,
  type Group,
  type GroupBy,
  type MoveQuality,
  type RatingTrend,
  type ReviewedMoveRow,
  type Tally,
} from './domain/stats'
export type { GameHistory } from './ports/gameHistory'
export type { ReviewRepository, StoredReview } from './ports/reviewRepository'
export { InMemoryReviewRepository } from './adapters/inMemoryReviewRepository'
export { ensureReview, type EnsureReviewDeps } from './usecases/ensureReview'
