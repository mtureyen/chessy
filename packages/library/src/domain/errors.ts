import type { GameOrigin, SourceId } from './game'

export class UserNotFoundError extends Error {
  readonly source: SourceId
  readonly username: string

  constructor(source: SourceId, username: string) {
    super(`No ${sourceName(source)} user "${username}"`)
    this.name = 'UserNotFoundError'
    this.source = source
    this.username = username
  }
}

/** The platform could not be reached, failed, or asked us to slow down. */
export class SourceUnavailableError extends Error {
  readonly source: SourceId
  /** Set when the platform told us when to try again (HTTP 429). */
  readonly retryAfterSeconds: number | undefined

  constructor(source: SourceId, detail: string, retryAfterSeconds?: number) {
    super(`${sourceName(source)} is not available right now (${detail})`)
    this.name = 'SourceUnavailableError'
    this.source = source
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export class InvalidUsernameError extends Error {
  constructor(username: string) {
    super(`"${username}" is not a valid username`)
    this.name = 'InvalidUsernameError'
  }
}

/** The platform has no such game, or none the user can reach (chess.com: only their own). */
export class GameNotFoundError extends Error {
  readonly source: SourceId
  readonly gameId: string

  constructor(source: SourceId, gameId: string, detail?: string) {
    super(`No ${sourceName(source)} game ${gameId}${detail ? ` (${detail})` : ''}`)
    this.name = 'GameNotFoundError'
    this.source = source
    this.gameId = gameId
  }
}

/** Two different library ids for the same platform game. */
export class DuplicateGameError extends Error {
  constructor(source: GameOrigin, externalId: string) {
    super(`Game ${source}:${externalId} is already stored under another id`)
    this.name = 'DuplicateGameError'
  }
}

const ORIGIN_NAMES: Record<GameOrigin, string> = {
  lichess: 'lichess',
  chesscom: 'chess.com',
  chessy: 'Chessy',
}

export function sourceName(source: GameOrigin): string {
  return ORIGIN_NAMES[source]
}
