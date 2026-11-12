import type { GameLine, StoredReview } from '@pawnia/history'
import type { GameRename, LibraryGame, Profile } from '@pawnia/library'

// Types only: app.ts (and through it the web app's typed client) sees this file, not the
// database code behind it.

export type LibraryStatus =
  | { available: true; database: string; games: number; reviews: number }
  | { available: false; reason: string }

/** What became of uploaded games: stored, or already held under another id (`renamed`). */
export interface SavedGames {
  stored: number
  renamed: GameRename[]
}

/** The server's copy of the game history, as the routes see it. */
export interface LibraryService {
  status(): Promise<LibraryStatus>
  /**
   * Stores games by id. A platform game already stored under another id is left as it is and
   * comes back in `renamed`. Throws DuplicateGameError only when two uploads race.
   */
  saveGames(games: LibraryGame[]): Promise<SavedGames>
  missingGames(ids: readonly string[]): Promise<string[]>
  /** Removes a game; fine when it isn't there. */
  deleteGame(id: string): Promise<void>
  saveReview(review: StoredReview): Promise<void>
  findReview(line: GameLine): Promise<StoredReview | undefined>
  profile(): Promise<Profile | undefined>
  saveProfile(profile: Profile): Promise<void>
}
