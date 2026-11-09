import type { HistoryImportProgress, LinkedAccount } from '@pawnia/library'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Services } from '@/app/services'
import { importRecord, runImport } from './historyImport'

// Tests run without a browser: a minimal localStorage.
const stored = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
} as Storage

const account: LinkedAccount = { source: 'chesscom', username: '8sly' }

/** A library whose history has `pages` pages, failing on page `failAt` once. */
function fakeLibrary(pages: number, failAt?: number) {
  const calls: { since?: string; cursor?: string }[] = []
  let failed = false
  const library = {
    newestGame: async () => '2026-11-02T10:00:00.000Z',
    importHistory: async (
      _source: string,
      _username: string,
      options: { since?: string; cursor?: string; onPage?: (p: HistoryImportProgress) => void },
    ) => {
      calls.push({ since: options.since, cursor: options.cursor })
      let page = Number(options.cursor ?? 0)
      let fetched = 0
      for (; page < pages; page++) {
        if (page === failAt && !failed) {
          failed = true
          throw new Error('HTTP 502')
        }
        fetched += 10
        const cursor = page + 1 < pages ? String(page + 1) : undefined
        options.onPage?.({
          fetched,
          added: fetched,
          progress: { done: page + 1, total: pages },
          ...(cursor && { cursor }),
        })
      }
      return { fetched, added: fetched, progress: { done: pages, total: pages }, complete: true }
    },
  } as unknown as Services['library']
  return { library, calls }
}

describe('runImport', () => {
  beforeEach(() => stored.clear())

  it('imports the whole history first, then only what is new', async () => {
    const { library, calls } = fakeLibrary(3)
    await runImport(library, account)
    expect(calls).toEqual([{ since: undefined, cursor: undefined }])
    expect(importRecord(account).completedAt).toBeDefined()

    await runImport(library, account)
    expect(calls[1]).toEqual({ since: '2026-11-02T10:00:00.000Z', cursor: undefined })
  })

  it('resumes an interrupted full import where it stopped', async () => {
    const { library, calls } = fakeLibrary(3, 2)
    await runImport(library, account)
    expect(importRecord(account)).toEqual({ cursor: '2' })

    await runImport(library, account)
    expect(calls[1]).toEqual({ since: undefined, cursor: '2' })
    expect(importRecord(account).cursor).toBeUndefined()
    expect(importRecord(account).completedAt).toBeDefined()
  })

  it('starts over on request, even after a completed import', async () => {
    const { library, calls } = fakeLibrary(2)
    await runImport(library, account)
    await runImport(library, account, { full: true })
    expect(calls[1]).toEqual({ since: undefined, cursor: undefined })
  })
})
