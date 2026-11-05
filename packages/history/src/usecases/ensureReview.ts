import type { GameReview, ReviewInput } from '@chessy/analysis'
import type { ReviewRepository, StoredReview } from '../ports/reviewRepository'

export interface EnsureReviewDeps {
  reviews: Pick<ReviewRepository, 'find' | 'save'>
  /** Reviews a line from scratch (engine, opening book, human-move model). */
  review: (input: ReviewInput) => Promise<GameReview>
  now: () => Date
}

/**
 * The review of a game's line: the stored one when there is one, else a new one, kept for next
 * time (and for statistics). `fresh` tells which.
 */
export async function ensureReview(
  { reviews, review, now }: EnsureReviewDeps,
  input: ReviewInput,
): Promise<{ stored: StoredReview; fresh: boolean }> {
  const line = { startFen: input.startFen, moves: input.moves }
  const found = await reviews.find(line)
  if (found) return { stored: found, fresh: false }
  const stored: StoredReview = {
    line,
    review: await review(input),
    reviewedAt: now().toISOString(),
  }
  await reviews.save(stored)
  return { stored, fresh: true }
}
