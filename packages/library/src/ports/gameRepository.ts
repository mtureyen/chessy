import type { GameOrigin, LibraryGame } from '../domain/game'

export interface ListGamesOptions {
  source?: GameOrigin
  limit?: number
}

/** Port: where library games live (IndexedDB in the browser now, a server database later). */
export interface GameRepository {
  /** Inserts or updates by id. Throws DuplicateGameError if (source, externalId) belongs to another id. */
  saveAll(games: LibraryGame[]): Promise<void>
  get(id: string): Promise<LibraryGame | undefined>
  findByExternalId(source: GameOrigin, externalId: string): Promise<LibraryGame | undefined>
  /** Newest first (by playedAt). */
  list(options?: ListGamesOptions): Promise<LibraryGame[]>
  delete(id: string): Promise<void>
}
