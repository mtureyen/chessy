/** History context: the user's finished games and reviews, kept for the coach and statistics. */
export { gameLine, lineText, type GameLine } from './domain/line'
export type { ReviewRepository, StoredReview } from './ports/reviewRepository'
export { InMemoryReviewRepository } from './adapters/inMemoryReviewRepository'
