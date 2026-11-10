import type { SourceId } from '@pawnia/library'

/** Someone looked up on the stats page. */
export interface PlayerSearch {
  source: SourceId
  username: string
}

const KEY = 'pawnia.stats-recent'
const KEEP = 5

/** The last players looked up in this browser, newest first; empty when storage is unavailable. */
export function recentSearches(
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
): PlayerSearch[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (s): s is PlayerSearch =>
          typeof s === 'object' &&
          s !== null &&
          (s.source === 'chesscom' || s.source === 'lichess') &&
          typeof s.username === 'string',
      )
      .slice(0, KEEP)
  } catch {
    return []
  }
}

/** Puts a player first in the recent searches (once, any spelling). */
export function rememberSearch(
  search: PlayerSearch,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = safeStorage(),
): void {
  const same = (s: PlayerSearch) =>
    s.source === search.source && s.username.toLowerCase() === search.username.toLowerCase()
  const next = [search, ...recentSearches(storage).filter((s) => !same(s))].slice(0, KEEP)
  try {
    storage?.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: the list is only a convenience.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}
