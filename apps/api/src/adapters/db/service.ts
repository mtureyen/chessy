import type { StoredReview } from '@chessy/history'
import type { LibraryGame } from '@chessy/library'
import type { LibraryService, LibraryStatus } from './libraryService'
import type { OpenDatabase } from './types'
import { PostgresGameRepository } from './gameRepository'
import { PostgresReviewRepository } from './reviewRepository'

interface Stores {
  name: string
  games: PostgresGameRepository
  reviews: PostgresReviewRepository
}

/**
 * The game history in a database: connects on first use (without a database the library is
 * reported unavailable and the app keeps everything in the browser) and retries after a failure.
 */
export class DatabaseLibraryService implements LibraryService {
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

  private connected(): Promise<Stores> {
    const open = this.open
    if (!open) return Promise.reject(new Error('No database configured (DATABASE_URL)'))
    this.stores ??= open()
      .then(({ db, name }) => ({
        name,
        games: new PostgresGameRepository(db),
        reviews: new PostgresReviewRepository(db),
      }))
      .catch((error: unknown) => {
        this.stores = undefined
        throw error
      })
    return this.stores
  }
}
