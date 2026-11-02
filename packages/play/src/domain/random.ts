/** A source of uniform numbers in [0, 1). */
export type Random = () => number

/** mulberry32: tiny and fast; the same seed gives the same sequence, so a bot game can be replayed. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Picks an index with probability proportional to its weight. Weights must be ≥ 0, one > 0. */
export function pickWeighted(weights: readonly number[], random: Random): number {
  const total = weights.reduce((sum, w) => sum + w, 0)
  let target = random() * total
  for (const [index, weight] of weights.entries()) {
    target -= weight
    if (target < 0) return index
  }
  // Rounding can leave a tiny remainder: fall back to the last move that had any weight.
  return weights.findLastIndex((w) => w > 0)
}
