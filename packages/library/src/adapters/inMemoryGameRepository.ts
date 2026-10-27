import { DuplicateGameError } from '../domain/errors'
import type { LibraryGame, SourceId } from '../domain/game'
import type { GameRepository, ListGamesOptions } from '../ports/gameRepository'

/** GameRepository in memory: for tests, and as a fallback where no storage is available. */
export class InMemoryGameRepository implements GameRepository {
  private readonly games = new Map<string, LibraryGame>()

  async saveAll(games: LibraryGame[]): Promise<void> {
    for (const game of games) {
      const owner = await this.findByExternalId(game.source, game.externalId)
      if (owner && owner.id !== game.id) throw new DuplicateGameError(game.source, game.externalId)
    }
    for (const game of games) this.games.set(game.id, structuredClone(game))
  }

  async get(id: string): Promise<LibraryGame | undefined> {
    const game = this.games.get(id)
    return game && structuredClone(game)
  }

  async findByExternalId(source: SourceId, externalId: string): Promise<LibraryGame | undefined> {
    for (const game of this.games.values()) {
      if (game.source === source && game.externalId === externalId) return structuredClone(game)
    }
    return undefined
  }

  async list({ source, limit }: ListGamesOptions = {}): Promise<LibraryGame[]> {
    const games = [...this.games.values()]
      .filter((game) => !source || game.source === source)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
    return structuredClone(limit === undefined ? games : games.slice(0, limit))
  }

  async delete(id: string): Promise<void> {
    this.games.delete(id)
  }
}
