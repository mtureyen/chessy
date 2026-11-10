import type { PlayerStatsBody } from '@pawnia/contracts'
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
