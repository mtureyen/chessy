import type { LinkedAccount } from '@pawnia/library'
import { useSyncExternalStore } from 'react'
import type { Services } from '@/app/services'

export type ImportState =
  | { status: 'idle' }
  | {
      status: 'running'
      /** `full`: the whole history (or the rest of it); `new`: only games since the last import. */
      mode: 'full' | 'new'
      fetched: number
      added: number
      progress: { done: number; total?: number }
    }
  | { status: 'done'; mode: 'full' | 'new'; fetched: number; added: number }
  | { status: 'error'; message: string }

/** What this browser remembers of an account's import between visits. */
export interface ImportRecord {
  /** Where an interrupted full import resumes. */
  cursor?: string
  /** When a full import last got through the whole history. */
  completedAt?: string
}

const IDLE: ImportState = { status: 'idle' }
const states = new Map<string, ImportState>()
const listeners = new Set<() => void>()

const keyOf = (account: LinkedAccount) => `${account.source}:${account.username.toLowerCase()}`
const storageKey = (account: LinkedAccount) => `chessy.history-import.${keyOf(account)}`

export function importRecord(account: LinkedAccount): ImportRecord {
  try {
    return JSON.parse(localStorage.getItem(storageKey(account)) ?? '{}') as ImportRecord
  } catch {
    return {}
  }
}

function saveRecord(account: LinkedAccount, record: ImportRecord): void {
  try {
    localStorage.setItem(storageKey(account), JSON.stringify(record))
  } catch {
    // Storage blocked: an interrupted import starts over next time.
  }
}

function setState(account: LinkedAccount, state: ImportState): void {
  states.set(keyOf(account), state)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useImportState(account: LinkedAccount): ImportState {
  return useSyncExternalStore(subscribe, () => states.get(keyOf(account)) ?? IDLE)
}

/** The import running right now, if any (for the header). */
export function useRunningImport(): Extract<ImportState, { status: 'running' }> | undefined {
  return useSyncExternalStore(subscribe, () => {
    for (const state of states.values()) if (state.status === 'running') return state
    return undefined
  })
}

/**
 * Imports an account's games in the background. Without a completed full import (or with
 * `full`), it brings in the whole history, resuming where an earlier run stopped; after one,
 * only the games played since the newest stored one. `onGames` runs after every stored page.
 */
export async function runImport(
  library: Services['library'],
  account: LinkedAccount,
  { full = false, onGames }: { full?: boolean; onGames?: () => void } = {},
): Promise<void> {
  if (states.get(keyOf(account))?.status === 'running') return
  const record = importRecord(account)
  const catchUp = !full && record.completedAt !== undefined && record.cursor === undefined
  const mode = catchUp ? 'new' : 'full'
  const since = catchUp ? await library.newestGame(account.source) : undefined
  setState(account, { status: 'running', mode, fetched: 0, added: 0, progress: { done: 0 } })
  try {
    const result = await library.importHistory(account.source, account.username, {
      ...(since && { since }),
      ...(!catchUp && record.cursor && { cursor: record.cursor }),
      onPage: (page) => {
        if (mode === 'full') saveRecord(account, { ...importRecord(account), cursor: page.cursor })
        setState(account, { status: 'running', mode, ...page })
        onGames?.()
      },
    })
    if (result.complete) {
      saveRecord(account, { completedAt: new Date().toISOString() })
      setState(account, { status: 'done', mode, fetched: result.fetched, added: result.added })
    }
  } catch (error) {
    setState(account, {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
