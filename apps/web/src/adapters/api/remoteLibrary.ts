import type { GameReview } from '@chessy/analysis'
import type {
  LibraryStatusBody,
  Problem,
  TrainingBody,
  TrainingResultBody,
} from '@chessy/contracts'
import type { GameLine } from '@chessy/history'
import type { LibraryGame, LibraryMirror, Profile } from '@chessy/library'
import type { ApiClient } from './client'

/** The API's copy of the game history: games and finished reviews are sent there. */
export class RemoteLibrary implements LibraryMirror {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  async status(): Promise<LibraryStatusBody> {
    const res = await this.api.api.v1.library.$get()
    return (await res.json()) as LibraryStatusBody
  }

  async missing(ids: readonly string[]): Promise<string[]> {
    const res = await this.api.api.v1.library.games.missing.$post({ json: { ids: [...ids] } })
    if (res.status !== 200) throw new Error(`Library sync failed: HTTP ${res.status}`)
    return ((await res.json()) as { missing: string[] }).missing
  }

  async upload(games: LibraryGame[]): Promise<void> {
    const res = await this.api.api.v1.library.games.$post({ json: { games } })
    if (res.status !== 200) throw new Error(`Library sync failed: HTTP ${res.status}`)
  }

  async saveReview(line: GameLine, review: GameReview): Promise<void> {
    const res = await this.api.api.v1.library.reviews.$post({
      json: { startFen: line.startFen, moves: [...line.moves], review },
    })
    if (res.status !== 200) throw new Error(`Saving the review failed: HTTP ${res.status}`)
  }

  /** The review kept of a line; null if there is none (or no database). */
  async review(line: GameLine): Promise<GameReview | null> {
    const res = await this.api.api.v1.library.reviews.find.$post({
      json: { startFen: line.startFen, moves: [...line.moves] },
    })
    if (res.status !== 200) return null
    return ((await res.json()) as unknown as { review: GameReview }).review
  }

  /** The user's mistakes as puzzles, and how far they are with them. */
  async training(): Promise<TrainingBody> {
    const res = await this.api.api.v1.training.$get()
    if (res.status !== 200) {
      const problem = (await res.json().catch(() => ({}))) as Partial<Problem>
      throw new Error(problem.detail ?? problem.title ?? `HTTP ${res.status}`)
    }
    return (await res.json()) as TrainingBody
  }

  async recordTraining(result: TrainingResultBody): Promise<void> {
    const res = await this.api.api.v1.training.results.$post({ json: result })
    if (res.status !== 200) throw new Error(`Saving the result failed: HTTP ${res.status}`)
  }

  /** The profile kept on the server; undefined if there is none (or no database). */
  async profile(): Promise<Profile | undefined> {
    const res = await this.api.api.v1.profile.$get()
    if (res.status !== 200) return undefined
    return ((await res.json()) as { profile: Profile | null }).profile ?? undefined
  }

  async saveProfile(profile: Profile): Promise<void> {
    const res = await this.api.api.v1.profile.$put({ json: { profile } })
    if (res.status !== 200) throw new Error(`Saving the profile failed: HTTP ${res.status}`)
  }
}
