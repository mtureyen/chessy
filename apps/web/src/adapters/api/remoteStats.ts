import type { PlayerStatsBody, PlayerSummaryBody, Problem } from '@pawnia/contracts'
import type { SourceId } from '@pawnia/library'
import type { ApiClient } from './client'

export type StatsSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical'

/** Which games the numbers cover. */
export interface StatsQuery {
  last: number
  speed?: StatsSpeed
}

/** Whose numbers: the user's own, or someone's on a platform. */
export type StatsPlayer = { kind: 'me' } | { kind: 'lookup'; source: SourceId; username: string }

/** The stats page's numbers from the API: the user's own, or anyone's on a platform. */
export class RemoteStats {
  private readonly api: ApiClient
  /** The viewer's time zone, for times of day and weekdays. */
  private readonly timeZone: string

  constructor(api: ApiClient, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    this.api = api
    this.timeZone = timeZone
  }

  async mine({ last, speed }: StatsQuery): Promise<PlayerStatsBody> {
    const res = await this.api.api.v1.stats.me.$get({
      query: { last: String(last), tz: this.timeZone, ...(speed && { speed }) },
    })
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as PlayerStatsBody
  }

  async player(source: SourceId, username: string, { last, speed }: StatsQuery) {
    const res = await this.api.api.v1.stats.players[':source'][':username'].$get({
      param: { source, username },
      query: { last: String(last), tz: this.timeZone, ...(speed && { speed }) },
    })
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as PlayerStatsBody
  }

  /** Has the coach say what these numbers mean: one model turn, so one paid request with the API. */
  async summary(
    player: StatsPlayer,
    { last, speed }: { last: number; speed?: PlayerStatsBody['window']['speed'] },
  ): Promise<PlayerSummaryBody> {
    const res = await this.api.api.v1.stats.summaries.$post({
      json: { player, last, tz: this.timeZone, ...(speed && { speed }) },
    })
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as PlayerSummaryBody
  }
}

async function problemText(res: Response): Promise<string> {
  const problem = (await res.json().catch(() => ({}))) as Partial<Problem>
  return problem.detail ?? problem.title ?? `HTTP ${res.status}`
}
