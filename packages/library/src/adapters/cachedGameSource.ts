import type { SourceGame, SourceId } from '../domain/game'
import type { GameSource } from '../ports/gameSource'

export interface CachedGameSourceOptions {
  ttlMs?: number
  now?: () => number
}

/**
 * Decorator: caches results for a short time, shares in-flight requests and runs requests
 * to the platform one at a time (lichess asks API clients not to send parallel requests).
 * Failures are not cached.
 */
export class CachedGameSource implements GameSource {
  readonly id: SourceId
  private readonly inner: GameSource
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly cache = new Map<string, { at: number; games: Promise<SourceGame[]> }>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(inner: GameSource, { ttlMs = 60_000, now = Date.now }: CachedGameSourceOptions = {}) {
    this.id = inner.id
    this.inner = inner
    this.ttlMs = ttlMs
    this.now = now
  }

  recentGames(username: string, options: { max: number }): Promise<SourceGame[]> {
    const key = `${username.toLowerCase()}:${options.max}`
    const hit = this.cache.get(key)
    if (hit && this.now() - hit.at < this.ttlMs) return hit.games

    const games = this.queue.then(() => this.inner.recentGames(username, options))
    this.queue = games.catch(() => undefined)
    const entry = { at: this.now(), games }
    this.cache.set(key, entry)
    games.catch(() => {
      if (this.cache.get(key) === entry) this.cache.delete(key)
    })
    return games
  }
}
