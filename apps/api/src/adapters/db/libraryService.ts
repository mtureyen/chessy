import type { StoredReview } from '@chessy/history'
import type { LibraryGame, Profile } from '@chessy/library'

// Types only: app.ts (and through it the web app's typed client) sees this file, not the
// database code behind it.

export type LibraryStatus =
  | { available: true; database: string; games: number; reviews: number }
  | { available: false; reason: string }

/** The server's copy of the game history, as the routes see it. */
export interface LibraryService {
  status(): Promise<LibraryStatus>
  saveGames(games: LibraryGame[]): Promise<void>
  missingGames(ids: readonly string[]): Promise<string[]>
  saveReview(review: StoredReview): Promise<void>
  profile(): Promise<Profile | undefined>
  saveProfile(profile: Profile): Promise<void>
}
