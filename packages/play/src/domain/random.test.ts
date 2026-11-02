import { describe, expect, it } from 'vitest'
import { pickWeighted, seededRandom } from './random'

describe('seededRandom', () => {
  it('repeats its sequence for the same seed and stays in [0, 1)', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    const values = Array.from({ length: 1000 }, () => a())
    expect(values).toEqual(Array.from({ length: 1000 }, () => b()))
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true)
    expect(seededRandom(43)()).not.toBe(values[0])
  })
})

describe('pickWeighted', () => {
  it('picks in proportion to the weights and never a zero weight', () => {
    const random = seededRandom(7)
    const counts = [0, 0, 0]
    for (let i = 0; i < 10_000; i++) counts[pickWeighted([3, 0, 1], random)]!++
    expect(counts[1]).toBe(0)
    expect(counts[0]! / 10_000).toBeCloseTo(0.75, 1)
  })

  it('handles the edges of the random range', () => {
    expect(pickWeighted([1, 1], () => 0)).toBe(0)
    expect(pickWeighted([1, 1, 0], () => 0.9999999999)).toBe(1)
  })
})
