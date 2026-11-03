import type { SourceId } from './game'

export type RatedSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence'

/** A platform account as its public profile shows it, e.g. to confirm "is this you?". */
export interface PlayerProfile {
  source: SourceId
  /** As the platform spells it. */
  username: string
  url: string
  /** e.g. "GM". */
  title?: string
  name?: string
  avatarUrl?: string
  /** ISO 3166 code, e.g. "DE". */
  country?: string
  /** Current ratings in standard chess, only for speeds the player has rated games in. */
  ratings: Partial<Record<RatedSpeed, number>>
}
