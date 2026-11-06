import {
  EngineFailedError,
  EvaluationCancelledError,
  type CancelSignal,
  type GameReview,
  type ReviewInput,
} from '@chessy/analysis'
import type { ReviewQueueBody, StartReviewQueueBody } from '@chessy/contracts'
import {
  ensureReview,
  gameLine,
  playerGames,
  recentGames,
  type GameHistory,
  type ReviewRepository,
} from '@chessy/history'
import type { LibraryGame, Profile } from '@chessy/library'
import { ReviewQueueBusyError, type ReviewQueueService } from './reviewQueueService'

/** What survives a restart: the run's games (those reviewed show in the history) and whether it was paused. */
export interface ReviewJob {
  gameIds: string[]
  paused: boolean
}

export interface ReviewQueueDeps {
  library: Pick<GameHistory, 'summaries'> & {
    game(id: string): Promise<LibraryGame | undefined>
    profile(): Promise<Profile | undefined>
  }
  reviews: Pick<ReviewRepository, 'find' | 'save'>
  review: (input: ReviewInput, options: { signal: CancelSignal }) => Promise<GameReview>
  store: {
    load(): Promise<ReviewJob | undefined>
    /** Undefined: no run to come back to. */
    save(job: ReviewJob | undefined): Promise<void>
  }
  now?: () => Date
}

/**
 * Reviews the user's last games one after the other, in the background. A game is reviewed once:
 * what has a review already only counts as done. A game that can't be reviewed is skipped; without
 * an engine the run stops.
 */
export class ReviewQueue implements ReviewQueueService {
  private readonly deps: ReviewQueueDeps
  private state: ReviewQueueBody = { status: 'idle', total: 0, done: 0, failed: 0 }
  private gameIds: string[] = []
  private remaining: string[] = []
  private stop: AbortController | undefined
  private working: Promise<void> = Promise.resolve()

  constructor(deps: ReviewQueueDeps) {
    this.deps = deps
  }

  status(): ReviewQueueBody {
    return { ...this.state }
  }

  async start({ count, speed }: StartReviewQueueBody): Promise<ReviewQueueBody> {
    if (this.state.status === 'running') throw new ReviewQueueBusyError()
    const before = this.state
    this.state = { status: 'running', total: 0, done: 0, failed: 0 }
    try {
      const { library } = this.deps
      const [summaries, profile] = await Promise.all([library.summaries(), library.profile()])
      const games = recentGames(playerGames(summaries, profile), {
        count,
        ...(speed && { speed }),
      })
      this.gameIds = games.map((g) => g.game.id)
      this.remaining = games.filter((g) => !g.game.reviewed).map((g) => g.game.id)
      this.state.total = games.length
      this.state.done = games.length - this.remaining.length
      await this.deps.store.save({ gameIds: this.gameIds, paused: false })
    } catch (error) {
      this.state = before
      throw error
    }
    this.run()
    return this.status()
  }

  async pause(): Promise<ReviewQueueBody> {
    if (this.state.status === 'running') {
      this.stop?.abort()
      await this.working
    }
    return this.status()
  }

  async resume(): Promise<ReviewQueueBody> {
    if (this.state.status === 'paused') {
      await this.deps.store.save({ gameIds: this.gameIds, paused: false })
      this.state = { ...this.state, status: 'running' }
      this.run()
    }
    return this.status()
  }

  /** Comes back to the run a restart interrupted; a paused one stays paused. */
  async restore(): Promise<void> {
    const job = await this.deps.store.load()
    if (!job) return
    const summaries = await this.deps.library.summaries()
    const stored = new Map(summaries.map((game) => [game.id, game]))
    this.gameIds = job.gameIds.filter((id) => stored.has(id))
    this.remaining = this.gameIds.filter((id) => !stored.get(id)!.reviewed)
    this.state = {
      status: job.paused ? 'paused' : 'running',
      total: this.gameIds.length,
      done: this.gameIds.length - this.remaining.length,
      failed: 0,
    }
    if (!job.paused) this.run()
  }

  private run(): void {
    const stop = new AbortController()
    this.stop = stop
    this.working = this.work(stop.signal).catch((error: unknown) =>
      this.end('failed', error instanceof Error ? error.message : String(error)),
    )
  }

  private async work(signal: AbortSignal): Promise<void> {
    for (const id of [...this.remaining]) {
      if (signal.aborted) break
      try {
        await this.reviewOne(id, signal)
        this.state.done++
      } catch (error) {
        if (error instanceof EvaluationCancelledError) break
        if (error instanceof EngineFailedError) throw error
        this.state.failed++
      }
      this.remaining.shift()
    }
    if (signal.aborted) {
      this.state.status = 'paused'
      await this.deps.store.save({ gameIds: this.gameIds, paused: true })
    } else {
      await this.end('finished')
    }
  }

  private async reviewOne(id: string, signal: AbortSignal): Promise<void> {
    const game = await this.deps.library.game(id)
    if (!game) return
    const line = gameLine(game.pgn)
    if (line.moves.length === 0) return
    const { white, black } = game
    await ensureReview(
      {
        reviews: this.deps.reviews,
        review: (input) => this.deps.review(input, { signal }),
        now: this.deps.now ?? (() => new Date()),
      },
      {
        ...line,
        ratings: {
          ...(white.rating !== undefined && { white: white.rating }),
          ...(black.rating !== undefined && { black: black.rating }),
        },
      },
    )
  }

  private async end(status: 'finished' | 'failed', reason?: string): Promise<void> {
    this.state = { ...this.state, status, ...(reason && { reason }) }
    await this.deps.store.save(undefined)
  }
}
