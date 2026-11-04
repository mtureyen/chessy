import { describe, expect, it } from 'vitest'
import { InMemoryGameRepository } from '../adapters/inMemoryGameRepository'
import type { SourceGame } from '../domain/game'
import type { GameSource, HistoryPage } from '../ports/gameSource'
import { sampleSourceGame } from '../testing'
import { importHistory, type HistoryImportProgress } from './importHistory'

/** Three months of two games each, newest first; the cursor is the next month's index. */
function threeMonths() {
  const months: SourceGame[][] = [0, 1, 2].map((m) =>
    [0, 1].map((g) => sampleSourceGame({ externalId: `m${m}g${g}` })),
  )
  const asked: { cursor?: string; since?: string }[] = []
  const source: GameSource = {
    id: 'lichess',
    recentGames: async () => [],
    game: async () => {
      throw new Error('not used')
    },
    player: async () => {
      throw new Error('not used')
    },
    async history(_username, options): Promise<HistoryPage> {
      asked.push(options)
      const index = Number(options.cursor ?? 0)
      return {
        games: months[index]!,
        ...(index < 2 && { next: String(index + 1) }),
        progress: { done: index + 1, total: 3 },
      }
    },
  }
  return { source, asked }
}

function deps(source: GameSource, repository = new InMemoryGameRepository()) {
  let id = 0
  return {
    source,
    repository,
    newId: () => `id${++id}`,
    now: () => new Date('2026-11-04T10:00:00Z'),
  }
}

describe('importHistory', () => {
  it('walks every page, stores each one and reports progress', async () => {
    const { source, asked } = threeMonths()
    const d = deps(source)
    const pages: HistoryImportProgress[] = []
    const result = await importHistory(d, { username: 'alice', onPage: (p) => pages.push(p) })
    expect(result).toEqual({
      fetched: 6,
      added: 6,
      progress: { done: 3, total: 3 },
      complete: true,
    })
    expect(pages.map((p) => [p.progress.done, p.cursor])).toEqual([
      [1, '1'],
      [2, '2'],
      [3, undefined],
    ])
    expect(asked).toEqual([{}, { cursor: '1' }, { cursor: '2' }])
    expect(await d.repository.list()).toHaveLength(6)
  })

  it('resumes at a cursor, passes `since` on and counts known games as not added', async () => {
    const { source, asked } = threeMonths()
    const d = deps(source)
    await importHistory(d, { username: 'alice' })
    const again = await importHistory(d, {
      username: 'alice',
      cursor: '2',
      since: '2026-01-01T00:00:00.000Z',
    })
    expect(again).toMatchObject({ fetched: 2, added: 0, complete: true })
    expect(asked.at(-1)).toEqual({ cursor: '2', since: '2026-01-01T00:00:00.000Z' })
  })

  it('stops unfinished when cancelled, keeping what it stored', async () => {
    const { source } = threeMonths()
    const d = deps(source)
    let pages = 0
    const result = await importHistory(d, {
      username: 'alice',
      onPage: () => pages++,
      cancelled: () => pages >= 1,
    })
    expect(result).toMatchObject({ fetched: 2, complete: false, cursor: '1' })
    expect(await d.repository.list()).toHaveLength(2)
  })
})
