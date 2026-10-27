import type { LibraryGame, SourceId } from '../domain/game'

export interface ListGamesOptions {
  source?: SourceId
  limit?: number
}

/** Port: where library games live (IndexedDB in the browser now, a server database later). */
export interface GameRepository {
  /** Inserts or updates by id. Throws DuplicateGameError if (source, externalId) belongs to another id. */
  saveAll(games: LibraryGame[]): Promise<void>
  get(id: string): Promise<LibraryGame | undefined>
  findByExternalId(source: SourceId, externalId: string): Promise<LibraryGame | undefined>
  /** Newest first (by playedAt). */
  list(options?: ListGamesOptions): Promise<LibraryGame[]>
  delete(id: string): Promise<void>
}
