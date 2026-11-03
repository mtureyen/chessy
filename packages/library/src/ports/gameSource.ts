import type { SourceGame, SourceId } from '../domain/game'

/**
 * Port: a platform that provides a user's games.
 * Server adapters talk to lichess/chess.com; the browser adapter talks to our API.
 */
export interface GameSource {
  readonly id: SourceId
  /**
   * The user's most recent games, newest first, standard chess only.
   * Throws UserNotFoundError or SourceUnavailableError.
   */
  recentGames(username: string, options: { max: number }): Promise<SourceGame[]>
  /**
   * One game by the id in its page URL (see parseGameUrl). Platforms without such a lookup
   * search the given user's games. Throws GameNotFoundError or SourceUnavailableError.
   */
  game(id: string, options: { username?: string }): Promise<SourceGame>
}
