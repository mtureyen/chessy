import type {
  GameHistory,
  GameLine,
  GameSummary,
  PuzzleProgress,
  ReviewedMoveRow,
  StoredReview,
} from '@pawnia/history'
import type { LibraryGame, Profile } from '@pawnia/library'
import type { LibraryService, LibraryStatus } from './libraryService'
import type { OpenDatabase } from './types'
import { PostgresGameHistory } from './gameHistory'
import { PostgresGameRepository } from './gameRepository'
import { PostgresProfileStore } from './profileStore'
import { PostgresReviewRepository } from './reviewRepository'
import { PostgresTrainingStore } from './trainingStore'
import { PostgresTryStore, type StoredTry } from './tryStore'
import { PostgresWalkthroughStore, type StoredWalkthrough } from './walkthroughStore'

interface Stores {
  name: string
  games: PostgresGameRepository
  reviews: PostgresReviewRepository
  profiles: PostgresProfileStore
  history: PostgresGameHistory
  walkthroughs: PostgresWalkthroughStore
  training: PostgresTrainingStore
  tries: PostgresTryStore
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

  async game(id: string): Promise<LibraryGame | undefined> {
    return (await this.connected()).games.get(id)
  }

  async findReview(line: GameLine): Promise<StoredReview | undefined> {
    return (await this.connected()).reviews.find(line)
  }

  async findWalkthrough(line: GameLine, side: string): Promise<StoredWalkthrough | undefined> {
    return (await this.connected()).walkthroughs.find(line, side)
  }

  async saveWalkthrough(line: GameLine, side: string, stored: StoredWalkthrough): Promise<void> {
    await (await this.connected()).walkthroughs.save(line, side, stored)
  }

  async findTry(line: GameLine, ply: number, tried: string): Promise<StoredTry | undefined> {
    return (await this.connected()).tries.find(line, ply, tried)
  }

  async saveTry(line: GameLine, ply: number, tried: string, stored: StoredTry): Promise<void> {
    await (await this.connected()).tries.save(line, ply, tried, stored)
  }

  async trainingProgress(): Promise<Map<string, PuzzleProgress>> {
    return (await this.connected()).training.all()
  }

  async saveTrainingProgress(line: GameLine, ply: number, progress: PuzzleProgress): Promise<void> {
    await (await this.connected()).training.save(line, ply, progress)
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

  async pgns(ids: readonly string[]): Promise<Map<string, string>> {
    return (await this.connected()).history.pgns(ids)
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
        walkthroughs: new PostgresWalkthroughStore(db),
        training: new PostgresTrainingStore(db),
        tries: new PostgresTryStore(db),
      }))
      .catch((error: unknown) => {
        this.stores = undefined
        throw error
      })
    return this.stores
  }
}
