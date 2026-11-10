import { describe, expect, it } from 'vitest'
import { recentSearches, rememberSearch } from './recentSearches'

function memory(initial?: string) {
  const items = new Map<string, string>(initial ? [['pawnia.stats-recent', initial]] : [])
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  }
}

describe('recent searches', () => {
  it('keeps the last five, newest first, each player once', () => {
    const storage = memory()
    for (const name of ['a1', 'b2', 'c3', 'd4', 'e5', 'f6']) {
      rememberSearch({ source: 'lichess', username: name }, storage)
    }
    rememberSearch({ source: 'lichess', username: 'D4' }, storage)
    expect(recentSearches(storage).map((s) => s.username)).toEqual(['D4', 'f6', 'e5', 'c3', 'b2'])
  })

  it('tells platforms apart', () => {
    const storage = memory()
    rememberSearch({ source: 'lichess', username: 'same' }, storage)
    rememberSearch({ source: 'chesscom', username: 'same' }, storage)
    expect(recentSearches(storage)).toHaveLength(2)
  })

  it('reads nothing from broken or missing storage', () => {
    expect(recentSearches(memory('not json'))).toEqual([])
    expect(recentSearches(memory('[{"source":"icc","username":"x"}]'))).toEqual([])
    expect(recentSearches(undefined)).toEqual([])
  })
})
