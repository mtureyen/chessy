import type {} from './env'
/** Library context: the user's games, imported from platforms and stored locally. */
export {
  DuplicateGameError,
  GameNotFoundError,
  InvalidUsernameError,
  SourceUnavailableError,
  UserNotFoundError,
  sourceName,
} from './domain/errors'
export {
  LOCAL_PLAYER_NAME,
  SOURCE_IDS,
  isValidUsername,
  outcomeFor,
  type GameOrigin,
  type GameResult,
  type GameSpeed,
  type LibraryGame,
  type Outcome,
  type PlayerInfo,
  type SourceGame,
  type SourceId,
  type Speed,
} from './domain/game'
export { parseGameUrl, type GameReference } from './domain/gameUrl'
export type { PlayerProfile, RatedSpeed } from './domain/player'
export { accountOn, buildProfile, sideOf, type LinkedAccount, type Profile } from './domain/profile'
export type { ProfileStore } from './ports/profileStore'
export type { GameRepository, ListGamesOptions } from './ports/gameRepository'
export type { GameSource } from './ports/gameSource'
export type { LibrarySettings, SettingsStore } from './ports/settingsStore'
export {
  importRecentGames,
  type ImportRecentGamesDeps,
  type ImportReport,
} from './usecases/importRecentGames'
export { openGame, UnsupportedGameUrlError, type OpenGameDeps } from './usecases/openGame'
export { CachedGameSource, type CachedGameSourceOptions } from './adapters/cachedGameSource'
export { InMemoryGameRepository } from './adapters/inMemoryGameRepository'
export { MirroredGameRepository } from './adapters/mirroredGameRepository'
export type { LibraryMirror } from './ports/libraryMirror'
export { mirrorLibrary } from './usecases/mirrorLibrary'
