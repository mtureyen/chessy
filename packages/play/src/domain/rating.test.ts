import { describe, expect, it } from 'vitest'
import { seededRandom } from './random'
import { estimateRatings, expectedScore, type RatedGame } from './rating'

/** Games between players of known strength, drawn from the Elo model (draws as half points). */
function simulate(truth: Record<string, number>, pairings: [string, string][], perPair: number) {
  const random = seededRandom(3)
  const games: RatedGame[] = []
  for (const [a, b] of pairings) {
    for (let i = 0; i < perPair; i++) {
      const [white, black] = i % 2 ? [a, b] : [b, a]
      const p = expectedScore(truth[white]!, truth[black]!)
      // Draws take some of each side's share, so the expected score stays exactly p.
      const draw = 0.4 * Math.min(p, 1 - p)
      const roll = random()
      const score = roll < p - draw / 2 ? 1 : roll < p + draw / 2 ? 0.5 : 0
      games.push({ white, black, score })
    }
  }
  return games
}

describe('estimateRatings', () => {
  it('recovers known ratings from enough games, anchors fixed', () => {
    const truth = { anchor: 1500, a: 1100, b: 1350, c: 1700, d: 2000 }
    const pairings: [string, string][] = [
      ['a', 'b'],
      ['b', 'anchor'],
      ['anchor', 'c'],
      ['c', 'd'],
      ['b', 'c'],
    ]
    const result = estimateRatings(simulate(truth, pairings, 2000), { anchor: 1500 })
    expect(result.anchor).toMatchObject({ rating: 1500, error: 0 })
    for (const name of ['a', 'b', 'c', 'd'] as const) {
      expect(Math.abs(result[name]!.rating - truth[name])).toBeLessThan(
        4 * result[name]!.error + 15,
      )
      expect(result[name]!.error).toBeGreaterThan(0)
    }
    expect(result.a!.rating).toBeLessThan(result.b!.rating)
    expect(result.d!.games).toBe(2000)
  })

  it('stays finite for a perfect score and shrinks the error with more games', () => {
    const sweep = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        i % 2
          ? { white: 'x', black: 'anchor', score: 1 }
          : { white: 'anchor', black: 'x', score: 0 },
      )
    const few = estimateRatings(sweep(10), { anchor: 1500 })
    const many = estimateRatings(sweep(100), { anchor: 1500 })
    expect(Number.isFinite(few.x!.rating)).toBe(true)
    expect(few.x!.rating).toBeGreaterThan(1700)
    expect(many.x!.rating).toBeGreaterThan(few.x!.rating)
    expect(few.x!.score).toBe(1)
  })

  it('converges for a player far from where the fit starts', () => {
    // Starts at the anchors' mean (~1450) and must climb past 1900 without overshooting.
    const anchors = { a1: 474, a2: 680, a3: 1054, a4: 1355, a5: 1692, a6: 1898, a7: 2133, a8: 2308 }
    const games: RatedGame[] = []
    for (let i = 0; i < 20; i++) {
      games.push({ white: 'x', black: 'a5', score: i < 16 ? 1 : 0 })
      games.push({ white: 'x', black: 'a6', score: i < 13 ? 1 : 0 })
    }
    const { x } = estimateRatings(games, anchors)
    expect(Number.isFinite(x!.rating)).toBe(true)
    expect(x!.rating).toBeGreaterThan(1898)
    expect(x!.rating).toBeLessThan(2200)
  })

  it('needs an anchor that every player connects to', () => {
    const games = [
      { white: 'a', black: 'b', score: 1 },
      { white: 'c', black: 'anchor', score: 0 },
    ]
    expect(() => estimateRatings(games, {})).toThrow(/anchor/)
    expect(() => estimateRatings(games, { anchor: 1500 })).toThrow(/a, b/)
  })
})
