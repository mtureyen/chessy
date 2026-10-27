import type {} from './env'
/** Library context: the user's games, imported from platforms and stored locally. */
export {
  DuplicateGameError,
  InvalidUsernameError,
  SourceUnavailableError,
  UserNotFoundError,
  sourceName,
} from './domain/errors'
export {
  SOURCE_IDS,
  isValidUsername,
  outcomeFor,
  type GameResult,
  type LibraryGame,
  type Outcome,
  type PlayerInfo,
  type SourceGame,
  type SourceId,
  type Speed,
} from './domain/game'
export type { GameRepository, ListGamesOptions } from './ports/gameRepository'
export type { GameSource } from './ports/gameSource'
export type { LibrarySettings, SettingsStore } from './ports/settingsStore'
export {
  importRecentGames,
  type ImportRecentGamesDeps,
  type ImportReport,
} from './usecases/importRecentGames'
export { CachedGameSource, type CachedGameSourceOptions } from './adapters/cachedGameSource'
export { InMemoryGameRepository } from './adapters/inMemoryGameRepository'
