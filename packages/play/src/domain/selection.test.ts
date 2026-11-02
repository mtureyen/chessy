import type { EngineLine, Score } from '@chessy/analysis'
import { describe, expect, it } from 'vitest'
import { BOT_LEVELS, botLevel, type BotLevel } from './levels'
import { seededRandom } from './random'
import { selectMove } from './selection'

const cp = (value: number): Score => ({ type: 'cp', value })
const line = (rank: number, move: string, score: Score): EngineLine => ({
  rank,
  depth: 10,
  score,
  pv: [move, 'e7e5'],
})

// White to move; a blunder that gives away a queen, two small slips and the best move.
const LINES = [
  line(1, 'e2e4', cp(40)),
  line(2, 'd2d4', cp(25)),
  line(3, 'g1f3', cp(0)),
  line(4, 'd1h5', cp(-900)),
]

function frequencies(level: BotLevel, lines: EngineLine[] = LINES, runs = 5000) {
  const random = seededRandom(1)
  const counts = new Map<string, number>()
  for (let i = 0; i < runs; i++) {
    const { move } = selectMove(lines, 'white', level, random)!
    counts.set(move, (counts.get(move) ?? 0) + 1)
  }
  return (move: string) => (counts.get(move) ?? 0) / runs
}

describe('selectMove', () => {
  it('gives each candidate a probability that falls with the win-% it loses', () => {
    const choice = selectMove(LINES, 'white', botLevel(4), seededRandom(1))!
    const probabilities = choice.candidates.map((c) => c.probability)
    expect(probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect([...probabilities].sort((a, b) => b - a)).toEqual(probabilities)
    expect(choice.candidates[0]).toMatchObject({ move: 'e2e4', loss: 0 })
  })

  it('never plays a move beyond the level’s maximum loss', () => {
    const level = botLevel(4)
    const choice = selectMove(LINES, 'white', level, seededRandom(1))!
    expect(choice.candidates.map((c) => c.move)).not.toContain('d1h5')
    expect(choice.candidates.every((c) => c.loss <= level.maxLoss)).toBe(true)
  })

  it('makes weaker levels play second-best and worse moves more often', () => {
    const best = BOT_LEVELS.map((level) => frequencies(level)('e2e4'))
    for (let i = 1; i < best.length; i++) expect(best[i]).toBeGreaterThanOrEqual(best[i - 1]!)
    expect(best[0]).toBeLessThan(0.5)
    expect(best.at(-1)).toBeGreaterThan(0.95)
  })

  it('lets only the weakest levels hang a queen, and rarely', () => {
    expect(frequencies(botLevel(1))('d1h5')).toBeGreaterThan(0)
    expect(frequencies(botLevel(1))('d1h5')).toBeLessThan(0.15)
    expect(frequencies(botLevel(3))('d1h5')).toBe(0)
  })

  it('always plays a short enough forced mate', () => {
    const mating = [
      line(1, 'h5f7', { type: 'mate', winner: 'white', moves: 1 }),
      line(2, 'e2e4', cp(800)),
    ]
    expect(frequencies(botLevel(1), mating)('h5f7')).toBe(1)
    const longMate = [
      line(1, 'h5f7', { type: 'mate', winner: 'white', moves: 5 }),
      line(2, 'e2e4', cp(300)),
    ]
    expect(frequencies(botLevel(2), longMate)('h5f7')).toBeLessThan(1)
    expect(frequencies(botLevel(8), longMate)('h5f7')).toBe(1)
  })

  it('reads scores from the side to move', () => {
    // Black to move: a lower score for White is better for Black.
    const lines = [line(1, 'e7e5', cp(-50)), line(2, 'a7a6', cp(400))]
    const choice = selectMove(lines, 'black', botLevel(8), seededRandom(1))!
    expect(choice.move).toBe('e7e5')
    expect(choice.candidates.map((c) => c.move)).toEqual(['e7e5'])
  })

  it('is reproducible from the seed and ignores repeated moves', () => {
    const run = () =>
      Array.from(
        { length: 50 },
        (
          (random) => () =>
            selectMove(LINES, 'white', botLevel(2), random)!.move
        )(seededRandom(9)),
      )
    expect(run()).toEqual(run())
    const repeated = [line(2, 'e2e4', cp(10)), line(1, 'e2e4', cp(40))]
    expect(selectMove(repeated, 'white', botLevel(1), seededRandom(1))!.candidates).toHaveLength(1)
  })

  it('returns undefined without lines', () => {
    expect(selectMove([], 'white', botLevel(1), seededRandom(1))).toBeUndefined()
  })
})

describe('BOT_LEVELS', () => {
  it('get stronger with every level', () => {
    for (const [i, level] of BOT_LEVELS.entries()) {
      expect(level.level).toBe(i + 1)
      const previous = BOT_LEVELS[i - 1]
      if (!previous) continue
      expect(level.nodes).toBeGreaterThan(previous.nodes)
      expect(level.temperature).toBeLessThan(previous.temperature)
      expect(level.maxLoss).toBeLessThan(previous.maxLoss)
      expect(level.seesMateIn).toBeGreaterThanOrEqual(previous.seesMateIn)
    }
    expect(() => botLevel(9)).toThrow(RangeError)
  })
})
