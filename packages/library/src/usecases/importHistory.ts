import { InvalidUsernameError } from '../domain/errors'
import { isValidUsername } from '../domain/game'
import type { HistoryPage } from '../ports/gameSource'
import { storeGames, type ImportRecentGamesDeps } from './importRecentGames'

export interface HistoryImportProgress {
  /** Games fetched so far, and how many of them were new to the library. */
  fetched: number
  added: number
  progress: HistoryPage['progress']
  /** Where to resume after an interruption; undefined once the history is complete. */
  cursor?: string
}

/**
 * Brings a user's whole history from a platform into the library, a page at a time, newest
 * first. Each page is stored before the next is fetched, so an interrupted import keeps what it
 * has and resumes at `cursor`. `since` (ISO) limits it to games played since then (catching up).
 * Stops early, unfinished, when `cancelled` says so.
 */
export async function importHistory(
  deps: ImportRecentGamesDeps,
  input: {
    username: string
    since?: string
    cursor?: string
    onPage?: (progress: HistoryImportProgress) => void
    cancelled?: () => boolean
  },
): Promise<HistoryImportProgress & { complete: boolean }> {
  const username = input.username.trim()
  if (!isValidUsername(username)) throw new InvalidUsernameError(username)

  let cursor = input.cursor
  let state: HistoryImportProgress = { fetched: 0, added: 0, progress: { done: 0 } }
  for (;;) {
    if (input.cancelled?.()) return { ...state, complete: false }
    const page = await deps.source.history(username, {
      ...(cursor && { cursor }),
      ...(input.since && { since: input.since }),
    })
    const { added } = await storeGames(deps, page.games)
    cursor = page.next
    state = {
      fetched: state.fetched + page.games.length,
      added: state.added + added,
      progress: page.progress,
      ...(cursor && { cursor }),
    }
    input.onPage?.(state)
    if (!cursor) return { ...state, complete: true }
  }
}
