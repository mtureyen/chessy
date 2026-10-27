import { InvalidUsernameError } from '../domain/errors'
import { isValidUsername, type LibraryGame } from '../domain/game'
import type { GameRepository } from '../ports/gameRepository'
import type { GameSource } from '../ports/gameSource'

export interface ImportRecentGamesDeps {
  source: GameSource
  repository: GameRepository
  newId: () => string
  now: () => Date
}

export interface ImportReport {
  /** The fetched games as stored, newest first. */
  games: LibraryGame[]
  /** How many of them were not in the library before. */
  added: number
}

/**
 * Fetches a user's recent games from a platform and stores them in the library.
 * Games already in the library keep their id and import date and get the fresh data.
 */
export async function importRecentGames(
  deps: ImportRecentGamesDeps,
  input: { username: string; max?: number },
): Promise<ImportReport> {
  const username = input.username.trim()
  if (!isValidUsername(username)) throw new InvalidUsernameError(username)

  const fetched = await deps.source.recentGames(username, { max: input.max ?? 20 })
  const games: LibraryGame[] = []
  let added = 0
  for (const game of fetched) {
    const existing = await deps.repository.findByExternalId(game.source, game.externalId)
    if (existing) {
      games.push({ ...game, id: existing.id, importedAt: existing.importedAt })
    } else {
      added++
      games.push({ ...game, id: deps.newId(), importedAt: deps.now().toISOString() })
    }
  }
  await deps.repository.saveAll(games)
  return { games, added }
}
