import type { LibraryGame } from '../domain/game'

/** Port: a second copy of the library the app keeps up to date (the server's game history). */
export interface LibraryMirror {
  /** Which of these game ids the copy doesn't have yet, in the order given. */
  missing(ids: readonly string[]): Promise<string[]>
  /** Inserts or updates the games by id. */
  upload(games: LibraryGame[]): Promise<void>
}
