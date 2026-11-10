import type { GameRepository } from '../ports/gameRepository'
import type { GameRename, LibraryMirror } from '../ports/libraryMirror'

/** Ids asked about / games uploaded per request. */
const ID_BATCH = 5000
const GAME_BATCH = 200

/**
 * Brings the mirror up to date with the local library: uploads every game it lacks, e.g. games
 * saved while the server was down. Games the mirror already held under other ids take those ids
 * here too. Returns how many games were uploaded.
 */
export async function mirrorLibrary({
  games,
  mirror,
  adopt = (renamed) => adoptMirrorIds(games, renamed),
}: {
  games: GameRepository
  mirror: LibraryMirror
  /** How local games take the mirror's ids; by default straight in `games`. */
  adopt?: (renamed: readonly GameRename[]) => Promise<void>
}): Promise<{ uploaded: number }> {
  const local = await games.list()
  const missing = new Set<string>()
  for (let i = 0; i < local.length; i += ID_BATCH) {
    const ids = local.slice(i, i + ID_BATCH).map((game) => game.id)
    for (const id of await mirror.missing(ids)) missing.add(id)
  }
  const upload = local.filter((game) => missing.has(game.id))
  for (let i = 0; i < upload.length; i += GAME_BATCH) {
    const { renamed } = await mirror.upload(upload.slice(i, i + GAME_BATCH))
    await adopt(renamed)
  }
  return { uploaded: upload.length }
}

/**
 * Gives local games the ids the mirror keeps them under, so every browser and the server know a
 * game by the same id (links between them keep working).
 */
export async function adoptMirrorIds(
  games: GameRepository,
  renamed: readonly GameRename[],
): Promise<void> {
  for (const { id, as } of renamed) {
    const game = await games.get(id)
    if (!game || id === as) continue
    await games.delete(id)
    await games.saveAll([{ ...game, id: as }])
  }
}
