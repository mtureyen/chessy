import type { GameRepository } from '../ports/gameRepository'
import type { LibraryMirror } from '../ports/libraryMirror'

/** Ids asked about / games uploaded per request. */
const ID_BATCH = 5000
const GAME_BATCH = 200

/**
 * Brings the mirror up to date with the local library: uploads every game it lacks, e.g. games
 * saved while the server was down. Returns how many games were uploaded.
 */
export async function mirrorLibrary({
  games,
  mirror,
}: {
  games: GameRepository
  mirror: LibraryMirror
}): Promise<{ uploaded: number }> {
  const local = await games.list()
  const missing = new Set<string>()
  for (let i = 0; i < local.length; i += ID_BATCH) {
    const ids = local.slice(i, i + ID_BATCH).map((game) => game.id)
    for (const id of await mirror.missing(ids)) missing.add(id)
  }
  const upload = local.filter((game) => missing.has(game.id))
  for (let i = 0; i < upload.length; i += GAME_BATCH) {
    await mirror.upload(upload.slice(i, i + GAME_BATCH))
  }
  return { uploaded: upload.length }
}
