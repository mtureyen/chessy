import type { GameReview } from '@chessy/analysis'
import type { LibraryStatusBody } from '@chessy/contracts'
import type { GameLine } from '@chessy/history'
import type { LibraryGame, LibraryMirror } from '@chessy/library'
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
}
