import type { LibraryGame } from '../domain/game'
import type { GameRepository, ListGamesOptions } from '../ports/gameRepository'
import type { GameRename, LibraryMirror } from '../ports/libraryMirror'
import { adoptMirrorIds } from '../usecases/mirrorLibrary'

/** The most games one upload carries: what the server's route accepts at once. */
export const UPLOAD_BATCH = 500

/**
 * The local library, with every save also sent to a mirror. The local save decides success; a
 * failed upload (server down, no database) is reported to `onMirrorError` and caught up later
 * by mirrorLibrary. Uploads go one after another, so a game saved twice in a row (a move, then
 * the result) reaches the mirror in that order. A game the mirror already held under another id
 * takes that id locally too, and `onRenamed` hears of it (e.g. to refresh a game list).
 */
export class MirroredGameRepository implements GameRepository {
  private readonly local: GameRepository
  private readonly mirror: LibraryMirror
  private readonly onMirrorError: (error: unknown) => void
  private readonly onRenamed: (renamed: GameRename[]) => void
  private uploads: Promise<void> = Promise.resolve()
  /** Ids games had before they took the mirror's: a page opened by the old id still finds them. */
  private readonly renamedTo = new Map<string, string>()

  constructor(
    local: GameRepository,
    mirror: LibraryMirror,
    onMirrorError: (error: unknown) => void = () => {},
    onRenamed: (renamed: GameRename[]) => void = () => {},
  ) {
    this.local = local
    this.mirror = mirror
    this.onMirrorError = onMirrorError
    this.onRenamed = onRenamed
  }

  async saveAll(games: LibraryGame[]): Promise<void> {
    await this.local.saveAll(games)
    if (games.length === 0) return
    this.uploads = this.uploads
      .then(async () => {
        // In batches the mirror takes: a month of many games would be turned away whole.
        for (let at = 0; at < games.length; at += UPLOAD_BATCH) {
          const { renamed } = await this.mirror.upload(games.slice(at, at + UPLOAD_BATCH))
          await this.adoptIds(renamed)
        }
      })
      .catch(this.onMirrorError)
  }

  /** Gives local games the ids the mirror keeps them under (see adoptMirrorIds). */
  async adoptIds(renamed: readonly GameRename[]): Promise<void> {
    if (renamed.length === 0) return
    for (const { id, as } of renamed) this.renamedTo.set(id, as)
    await adoptMirrorIds(this.local, renamed)
    this.onRenamed([...renamed])
  }

  async get(id: string) {
    const game = await this.local.get(id)
    if (game) return game
    const now = this.renamedTo.get(id)
    return now === undefined ? undefined : this.local.get(now)
  }

  findByExternalId(...args: Parameters<GameRepository['findByExternalId']>) {
    return this.local.findByExternalId(...args)
  }

  list(options?: ListGamesOptions) {
    return this.local.list(options)
  }

  /**
   * Deletes here and, after the uploads on their way, in the mirror: a game that stayed in the
   * copy would go on counting in everything the copy is asked about. A game the mirror keeps
   * under another id is deleted under that one too.
   */
  async delete(id: string): Promise<void> {
    const ids = [id, this.renamedTo.get(id)].filter((known) => known !== undefined)
    for (const known of ids) await this.local.delete(known)
    this.uploads = this.uploads
      .then(async () => {
        for (const known of ids) await this.mirror.remove(known)
      })
      .catch(this.onMirrorError)
  }
}
