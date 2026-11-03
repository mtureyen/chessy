import type { LibraryGame } from '../domain/game'
import type { GameRepository, ListGamesOptions } from '../ports/gameRepository'
import type { LibraryMirror } from '../ports/libraryMirror'

/**
 * The local library, with every save also sent to a mirror. The local save decides success; a
 * failed upload (server down, no database) is reported to `onMirrorError` and caught up later
 * by mirrorLibrary.
 */
export class MirroredGameRepository implements GameRepository {
  private readonly local: GameRepository
  private readonly mirror: LibraryMirror
  private readonly onMirrorError: (error: unknown) => void

  constructor(
    local: GameRepository,
    mirror: LibraryMirror,
    onMirrorError: (error: unknown) => void = () => {},
  ) {
    this.local = local
    this.mirror = mirror
    this.onMirrorError = onMirrorError
  }

  async saveAll(games: LibraryGame[]): Promise<void> {
    await this.local.saveAll(games)
    if (games.length > 0) this.mirror.upload(games).catch(this.onMirrorError)
  }

  get(id: string) {
    return this.local.get(id)
  }

  findByExternalId(...args: Parameters<GameRepository['findByExternalId']>) {
    return this.local.findByExternalId(...args)
  }

  list(options?: ListGamesOptions) {
    return this.local.list(options)
  }

  delete(id: string) {
    return this.local.delete(id)
  }
}
