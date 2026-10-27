import { describe, expect, it } from 'vitest'
import { classifyMove, expectedPointsLost, type MoveFacts } from './classify'

const quiet: MoveFacts = {
  isBestMove: false,
  winBefore: 55,
  winAfter: 55,
  legalMoves: 30,
  inBook: false,
  sacrifice: 0,
  isRecapture: false,
  inCheck: false,
}
const move = (facts: Partial<MoveFacts>) => classifyMove({ ...quiet, ...facts })

describe('classifyMove: expected points lost (chess.com thresholds)', () => {
  it.each([
    [55, 'excellent'],
    [53.5, 'excellent'],
    [53, 'good'],
    [50.5, 'good'],
    [50, 'inaccuracy'],
    [45.5, 'inaccuracy'],
    [45, 'mistake'],
    [35.5, 'mistake'],
    [35, 'blunder'],
    [5, 'blunder'],
  ] as const)('55%% → %s%% is %s', (winAfter, expected) => {
    expect(move({ winAfter })).toBe(expected)
  })

  it('computes the loss in expected points and never below 0', () => {
    expect(expectedPointsLost({ winBefore: 60, winAfter: 45 })).toBeCloseTo(0.15)
    expect(expectedPointsLost({ winBefore: 40, winAfter: 60 })).toBe(0)
  })
})

describe('classifyMove: special classes', () => {
  it('forced and book win over everything', () => {
    expect(move({ legalMoves: 1, winAfter: 5 })).toBe('forced')
    expect(move({ inBook: true, winAfter: 50 })).toBe('book')
  })

  it('best = the engine’s top move', () => {
    expect(move({ isBestMove: true })).toBe('best')
  })

  it('great = the only good move, but not a plain recapture or an escape from check', () => {
    expect(move({ isBestMove: true, secondBestWin: 40 })).toBe('great')
    expect(move({ isBestMove: true, secondBestWin: 44 })).toBe('best')
    expect(move({ isBestMove: true, secondBestWin: 20, isRecapture: true })).toBe('best')
    expect(move({ isBestMove: true, secondBestWin: 20, inCheck: true })).toBe('best')
    expect(move({ isBestMove: true, winBefore: 97, winAfter: 97, secondBestWin: 60 })).toBe('best') // already won
  })

  it('brilliant = a sound sacrifice when not already winning', () => {
    expect(move({ isBestMove: true, sacrifice: 3, winBefore: 60, winAfter: 62 })).toBe('brilliant')
    expect(move({ sacrifice: 3, winBefore: 60, winAfter: 59 })).toBe('brilliant')
    expect(move({ sacrifice: 1, winBefore: 60, winAfter: 60 })).toBe('excellent')
    expect(move({ sacrifice: 3, winBefore: 95, winAfter: 95 })).toBe('excellent') // winning anyway
    expect(move({ sacrifice: 3, winBefore: 40, winAfter: 40 })).toBe('excellent') // still worse after
    expect(move({ sacrifice: 3, winBefore: 60, winAfter: 45 })).toBe('mistake') // unsound
  })

  it('miss = giving back most of what the opponent’s mistake offered', () => {
    expect(move({ opponentLoss: 0.25, winBefore: 80, winAfter: 66 })).toBe('miss')
    expect(move({ opponentLoss: 0.25, winBefore: 80, winAfter: 76 })).toBe('good')
    expect(move({ opponentLoss: 0.05, winBefore: 80, winAfter: 66 })).toBe('mistake')
    expect(move({ opponentLoss: 0.3, winBefore: 80, winAfter: 55 })).toBe('blunder')
  })
})
