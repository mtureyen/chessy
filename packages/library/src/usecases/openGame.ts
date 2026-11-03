import { GameNotFoundError, InvalidUsernameError } from '../domain/errors'
import { isValidUsername, type LibraryGame, type SourceId } from '../domain/game'
import { parseGameUrl } from '../domain/gameUrl'
import type { GameRepository } from '../ports/gameRepository'
import type { GameSource } from '../ports/gameSource'

export interface OpenGameDeps {
  sources: Record<SourceId, GameSource>
  repository: GameRepository
  newId: () => string
  now: () => Date
}

/** The URL names no game we can open. */
export class UnsupportedGameUrlError extends Error {
  constructor(url: string) {
    super(`Not a lichess or chess.com game: ${url}`)
    this.name = 'UnsupportedGameUrlError'
  }
}

/**
 * Brings the game behind a page URL into the library (or refreshes it there) and returns it.
 * chess.com games are found among the given user's games only.
 * Throws UnsupportedGameUrlError, GameNotFoundError or SourceUnavailableError.
 */
export async function openGame(
  deps: OpenGameDeps,
  input: { url: string; usernames: Partial<Record<SourceId, string>> },
): Promise<LibraryGame> {
  const ref = parseGameUrl(input.url)
  if (!ref) throw new UnsupportedGameUrlError(input.url)
  const username = input.usernames[ref.source]?.trim()
  if (ref.source === 'chesscom' && !username) {
    throw new GameNotFoundError(
      ref.source,
      ref.id,
      'set your chess.com username under Games: only your own games can be opened',
    )
  }
  if (username && !isValidUsername(username)) throw new InvalidUsernameError(username)

  const game = await deps.sources[ref.source].game(ref.id, username ? { username } : {})
  const existing = await deps.repository.findByExternalId(game.source, game.externalId)
  const stored: LibraryGame = existing
    ? { ...game, id: existing.id, importedAt: existing.importedAt }
    : { ...game, id: deps.newId(), importedAt: deps.now().toISOString() }
  await deps.repository.saveAll([stored])
  return stored
}
