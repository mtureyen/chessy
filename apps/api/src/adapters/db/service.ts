import type { GameHistory, GameSummary, ReviewedMoveRow, StoredReview } from '@chessy/history'
import type { LibraryGame, Profile } from '@chessy/library'
import type { LibraryService, LibraryStatus } from './libraryService'
import type { OpenDatabase } from './types'
import { PostgresGameHistory } from './gameHistory'
import { PostgresGameRepository } from './gameRepository'
import { PostgresProfileStore } from './profileStore'
import { PostgresReviewRepository } from './reviewRepository'

interface Stores {
  name: string
  games: PostgresGameRepository
  reviews: PostgresReviewRepository
  profiles: PostgresProfileStore
  history: PostgresGameHistory
}

/**
 * The game history in a database: connects on first use (without a database the library is
 * reported unavailable and the app keeps everything in the browser) and retries after a failure.
 * Also what the coach reads the history from.
 */
export class DatabaseLibraryService implements LibraryService, GameHistory {
  private readonly open: (() => Promise<OpenDatabase>) | undefined
  private stores: Promise<Stores> | undefined

  /** `open` undefined: no database configured. */
  constructor(open: (() => Promise<OpenDatabase>) | undefined) {
    this.open = open
  }

  async status(): Promise<LibraryStatus> {
    try {
      const { name, games, reviews } = await this.connected()
      return {
        available: true,
        database: name,
        games: await games.count(),
        reviews: await reviews.count(),
      }
    } catch (error) {
      return { available: false, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  async saveGames(games: LibraryGame[]): Promise<void> {
    await (await this.connected()).games.saveAll(games)
  }

  async missingGames(ids: readonly string[]): Promise<string[]> {
    return (await this.connected()).games.missing(ids)
  }

  async saveReview(review: StoredReview): Promise<void> {
    await (await this.connected()).reviews.save(review)
  }

  async profile(): Promise<Profile | undefined> {
    return (await this.connected()).profiles.load()
  }

  async saveProfile(profile: Profile): Promise<void> {
    await (await this.connected()).profiles.save(profile)
  }

  async summaries(): Promise<GameSummary[]> {
    return (await this.connected()).history.summaries()
  }

  async reviewedMoves(): Promise<ReviewedMoveRow[]> {
    return (await this.connected()).history.reviewedMoves()
  }

  private connected(): Promise<Stores> {
    const open = this.open
    if (!open) return Promise.reject(new Error('No database configured (DATABASE_URL)'))
    this.stores ??= open()
      .then(({ db, name }) => ({
        name,
        games: new PostgresGameRepository(db),
        reviews: new PostgresReviewRepository(db),
        profiles: new PostgresProfileStore(db),
        history: new PostgresGameHistory(db),
      }))
      .catch((error: unknown) => {
        this.stores = undefined
        throw error
      })
    return this.stores
  }
}
