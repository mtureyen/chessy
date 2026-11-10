import { isValidUsername, type SourceId } from '@pawnia/library'

/** URL search params of /stats: someone to look up; without them, the user's own stats. */
export interface StatsSearch {
  source?: SourceId
  user?: string
}

export function parseStatsSearch(search: Record<string, unknown>): StatsSearch {
  const { source, user } = search
  if ((source !== 'chesscom' && source !== 'lichess') || typeof user !== 'string') return {}
  return isValidUsername(user) ? { source, user } : {}
}
