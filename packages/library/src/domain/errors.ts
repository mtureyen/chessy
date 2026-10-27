import type { SourceId } from './game'

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

/** Two different library ids for the same platform game. */
export class DuplicateGameError extends Error {
  constructor(source: SourceId, externalId: string) {
    super(`Game ${source}:${externalId} is already stored under another id`)
    this.name = 'DuplicateGameError'
  }
}

export function sourceName(source: SourceId): string {
  return source === 'lichess' ? 'lichess' : 'chess.com'
}
