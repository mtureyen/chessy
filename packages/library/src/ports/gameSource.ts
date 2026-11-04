import type { SourceGame, SourceId } from '../domain/game'
import type { PlayerProfile } from '../domain/player'

/** One page of a user's whole game history, newest first. */
export interface HistoryPage {
  /** Standard chess only, newest first. */
  games: SourceGame[]
  /** Where the next (older) page starts; undefined after the last page. */
  next?: string
  /** How far through the history this page is, e.g. months of an archive. */
  progress: { done: number; total?: number }
}

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
  /**
   * A user's whole history, a page at a time: start without `cursor`, then pass each page's
   * `next`. `since` (ISO): only games played since then, for catching up. Throws
   * UserNotFoundError or SourceUnavailableError.
   */
  history(username: string, options: { cursor?: string; since?: string }): Promise<HistoryPage>
  /** The account's public profile. Throws UserNotFoundError or SourceUnavailableError. */
  player(username: string): Promise<PlayerProfile>
}
