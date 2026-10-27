import { describe, expect, it } from 'vitest'
import type { SourceGame } from '../domain/game'
import type { GameSource } from '../ports/gameSource'
import { sampleGame } from '../testing'
import { CachedGameSource } from './cachedGameSource'

/** A source whose answers the test releases by hand. */
function controllableSource() {
  const calls: {
    username: string
    resolve: (games: SourceGame[]) => void
    reject: (e: Error) => void
  }[] = []
  const source: GameSource = {
    id: 'lichess',
    recentGames: (username) =>
      new Promise((resolve, reject) => {
        calls.push({ username, resolve, reject })
      }),
  }
  return { source, calls }
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('CachedGameSource', () => {
  it('shares in-flight requests and caches results for the TTL', async () => {
    let now = 0
    const { source, calls } = controllableSource()
    const cached = new CachedGameSource(source, { ttlMs: 1000, now: () => now })

    const a = cached.recentGames('Alice', { max: 5 })
    const b = cached.recentGames('alice', { max: 5 })
    await tick()
    expect(calls).toHaveLength(1)
    calls[0]!.resolve([sampleGame()])
    expect(await a).toBe(await b)

    now = 999
    await cached.recentGames('alice', { max: 5 })
    expect(calls).toHaveLength(1)

    now = 1000
    void cached.recentGames('alice', { max: 5 })
    await tick()
    expect(calls).toHaveLength(2)
  })

  it('runs requests one at a time', async () => {
    const { source, calls } = controllableSource()
    const cached = new CachedGameSource(source)
    void cached.recentGames('alice', { max: 5 })
    void cached.recentGames('bob', { max: 5 })
    await tick()
    expect(calls.map((c) => c.username)).toEqual(['alice'])
    calls[0]!.resolve([])
    await tick()
    expect(calls.map((c) => c.username)).toEqual(['alice', 'bob'])
  })

  it('does not cache failures and keeps the queue going', async () => {
    const { source, calls } = controllableSource()
    const cached = new CachedGameSource(source)
    const failing = cached.recentGames('alice', { max: 5 })
    await tick()
    calls[0]!.reject(new Error('boom'))
    await expect(failing).rejects.toThrow('boom')

    const retry = cached.recentGames('alice', { max: 5 })
    await tick()
    expect(calls).toHaveLength(2)
    calls[1]!.resolve([])
    expect(await retry).toEqual([])
  })
})
