import type { GameRepository } from '@pawnia/library'
import { gameLine, lineText, type GameLine } from '../domain/line'
import type { ReviewRepository, StoredReview } from '../ports/reviewRepository'

/** Reviews kept in memory, for tests and as the reference for other adapters. */
export class InMemoryReviewRepository implements ReviewRepository {
  private readonly games: GameRepository
  private readonly reviews = new Map<string, StoredReview>()

  /** `games`: where `forGame` finds a game's line. */
  constructor(games: GameRepository) {
    this.games = games
  }

  async save(review: StoredReview): Promise<void> {
    this.reviews.set(lineText(review.line), structuredClone(review))
  }

  async find(line: GameLine): Promise<StoredReview | undefined> {
    const review = this.reviews.get(lineText(line))
    return review && structuredClone(review)
  }

  async forGame(gameId: string): Promise<StoredReview | undefined> {
    const game = await this.games.get(gameId)
    return game ? this.find(gameLine(game.pgn)) : undefined
  }

  async count(): Promise<number> {
    return this.reviews.size
  }
}
