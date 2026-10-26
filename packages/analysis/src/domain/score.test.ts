import { describe, expect, it } from 'vitest'
import { compareScores, formatScore, toWhitePov, whiteWinChance, type Score } from './score'

describe('toWhitePov', () => {
  it('keeps centipawns for White to move and flips them for Black', () => {
    expect(toWhitePov({ type: 'cp', value: 35 }, 'white')).toEqual({ type: 'cp', value: 35 })
    expect(toWhitePov({ type: 'cp', value: 35 }, 'black')).toEqual({ type: 'cp', value: -35 })
  })

  it('turns relative mate scores into a winner', () => {
    expect(toWhitePov({ type: 'mate', value: 3 }, 'white')).toEqual({
      type: 'mate',
      winner: 'white',
      moves: 3,
    })
    expect(toWhitePov({ type: 'mate', value: 3 }, 'black')).toEqual({
      type: 'mate',
      winner: 'black',
      moves: 3,
    })
    expect(toWhitePov({ type: 'mate', value: -2 }, 'black')).toEqual({
      type: 'mate',
      winner: 'white',
      moves: 2,
    })
  })

  it('reads `mate 0` as the side to move being mated', () => {
    expect(toWhitePov({ type: 'mate', value: 0 }, 'white')).toEqual({
      type: 'mate',
      winner: 'black',
      moves: 0,
    })
    expect(toWhitePov({ type: 'mate', value: 0 }, 'black')).toEqual({
      type: 'mate',
      winner: 'white',
      moves: 0,
    })
  })
})

describe('whiteWinChance (lichess formula)', () => {
  it('is 50 for an equal position and symmetric', () => {
    expect(whiteWinChance({ type: 'cp', value: 0 })).toBe(50)
    const plus = whiteWinChance({ type: 'cp', value: 300 })
    const minus = whiteWinChance({ type: 'cp', value: -300 })
    expect(plus).toBeCloseTo(75.11, 1)
    expect(plus + minus).toBeCloseTo(100, 10)
  })

  it('is 100 / 0 for mates', () => {
    expect(whiteWinChance({ type: 'mate', winner: 'white', moves: 5 })).toBe(100)
    expect(whiteWinChance({ type: 'mate', winner: 'black', moves: 1 })).toBe(0)
  })
})

describe('formatScore', () => {
  it.each<[Score, string]>([
    [{ type: 'cp', value: 35 }, '+0.35'],
    [{ type: 'cp', value: 0 }, '+0.00'],
    [{ type: 'cp', value: -120 }, '-1.20'],
    [{ type: 'mate', winner: 'white', moves: 3 }, '#3'],
    [{ type: 'mate', winner: 'black', moves: 2 }, '#-2'],
  ])('%j → %s', (score, text) => {
    expect(formatScore(score)).toBe(text)
  })
})

describe('compareScores', () => {
  it('orders from White’s perspective with mates outranking centipawns', () => {
    const scores: Score[] = [
      { type: 'cp', value: 50 },
      { type: 'mate', winner: 'black', moves: 3 },
      { type: 'mate', winner: 'white', moves: 5 },
      { type: 'cp', value: -900 },
      { type: 'mate', winner: 'white', moves: 1 },
      { type: 'mate', winner: 'black', moves: 1 },
    ]
    expect(scores.sort(compareScores).map(formatScore)).toEqual([
      '#-1',
      '#-3',
      '-9.00',
      '+0.50',
      '#5',
      '#1',
    ])
  })
})
