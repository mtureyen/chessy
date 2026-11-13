import type { CancelSignal, CoachAgent } from '@pawnia/coach'
import type { PlayerStatsBody, PlayerSummaryBody } from '@pawnia/contracts'
import type { GameSpeed, SourceId } from '@pawnia/library'

// Types only: app.ts (and through it the web app's typed client) sees this file, not the code
// behind it.

/** Which games the numbers cover. */
export interface StatsQuery {
  /** The newest this many finished games. */
  last: number
  speed?: GameSpeed
  /** IANA time zone for times of day and weekdays. */
  tz: string
}

/** The stats page's numbers: the user's own, or anyone's on a platform. */
export interface StatsService {
  /** From the stored history. Throws when there is no database. */
  mine(query: StatsQuery): Promise<PlayerStatsBody>
  /** Read live from the platform. Throws what GameSource does (UserNotFoundError, …). */
  player(source: SourceId, username: string, query: StatsQuery): Promise<PlayerStatsBody>
}

/** The coach's reading of the stats page's numbers, as the routes see it. */
export interface PlayerSummaryService {
  /**
   * The coach's summary of these numbers; nothing is kept. Asked for the same numbers while
   * that one is written, it waits for it. Throws when the coach gives nothing usable.
   */
  write(
    stats: PlayerStatsBody,
    agent: CoachAgent,
    signal?: CancelSignal,
  ): Promise<PlayerSummaryBody>
}
