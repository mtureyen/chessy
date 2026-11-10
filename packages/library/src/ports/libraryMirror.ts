import type { LibraryGame } from '../domain/game'

/** A game the mirror already holds under another id: `as` is the id it keeps. */
export interface GameRename {
  id: string
  as: string
}

/** Port: a second copy of the library the app keeps up to date (the server's game history). */
export interface LibraryMirror {
  /** Which of these game ids the copy doesn't have yet, in the order given. */
  missing(ids: readonly string[]): Promise<string[]>
  /**
   * Inserts or updates the games by id. A platform game the copy already holds under another id
   * (imported in another browser) isn't stored twice: it comes back in `renamed` with that id.
   */
  upload(games: LibraryGame[]): Promise<{ renamed: GameRename[] }>
}
