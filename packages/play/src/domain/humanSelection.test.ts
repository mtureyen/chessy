import { describe, expect, it } from 'vitest'
import { sampleHumanMove } from './humanSelection'
import { seededRandom } from './random'

// What humans play after 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5, roughly.
const MOVES = [
  { move: 'd7d5', probability: 0.55 },
  { move: 'f8c5', probability: 0.2 },
  { move: 'h7h6', probability: 0.15 },
  { move: 'b7b5', probability: 0.06 },
  { move: 'g7g5', probability: 0.04 },
]

function frequencies(style: { temperature: number; topP: number }, runs = 5000) {
  const random = seededRandom(7)
  const counts = new Map<string, number>()
  for (let i = 0; i < runs; i++) {
    const move = sampleHumanMove(MOVES, style, random)!
    counts.set(move, (counts.get(move) ?? 0) + 1)
  }
  return (move: string) => (counts.get(move) ?? 0) / runs
}

describe('sampleHumanMove', () => {
  it('plays moves as often as humans do at temperature 1', () => {
    const played = frequencies({ temperature: 1, topP: 1 })
    expect(played('d7d5')).toBeCloseTo(0.55, 1)
    expect(played('h7h6')).toBeCloseTo(0.15, 1)
  })

  it('never plays moves outside the top-p share', () => {
    const played = frequencies({ temperature: 1, topP: 0.9 })
    expect(played('b7b5')).toBe(0)
    expect(played('g7g5')).toBe(0)
  })

  it('plays less common moves more often above temperature 1, fewer below', () => {
    const loose = frequencies({ temperature: 2, topP: 1 })
    const tight = frequencies({ temperature: 0.5, topP: 1 })
    expect(loose('d7d5')).toBeLessThan(0.45)
    expect(tight('d7d5')).toBeGreaterThan(0.75)
  })

  it('keeps at least the most likely move and handles none', () => {
    expect(sampleHumanMove(MOVES, { temperature: 1, topP: 0 }, seededRandom(1))).toBe('d7d5')
    expect(sampleHumanMove([], { temperature: 1, topP: 1 }, seededRandom(1))).toBeUndefined()
  })
})
