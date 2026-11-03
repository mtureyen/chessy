import { describe, expect, it } from 'vitest'
import {
  CLASSIFY_CONFIG,
  classifyMove,
  expectedPointsLost,
  type ClassifyConfig,
  type MoveFacts,
} from './classify'

const quiet: MoveFacts = {
  isBestMove: false,
  winBefore: 55,
  winAfter: 55,
  legalMoves: 30,
  inBook: false,
  sacrifice: 0,
  sacrificeTaken: 0,
  isRecapture: false,
  inCheck: false,
}
/** Expected points on lichess' fixed curve: a loss is just the drop in win %. */
const lichess: ClassifyConfig = {
  ...CLASSIFY_CONFIG,
  expectedPointsSlope: { at500: 1, at2000: 1 },
  bestMaxLoss: 0,
}
const move = (facts: Partial<MoveFacts>, config = lichess) =>
  classifyMove({ ...quiet, ...facts }, config)

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
    [25, 'blunder'],
    [5, 'blunder'],
  ] as const)('55%% → %s%% is %s', (winAfter, expected) => {
    expect(move({ winAfter })).toBe(expected)
  })

  it('calls a big drop a mistake, not a blunder, while the game is still fine', () => {
    expect(move({ winBefore: 90, winAfter: 55 })).toBe('mistake') // still better
    expect(move({ winBefore: 60, winAfter: 25 })).toBe('blunder') // now losing
  })

  it('uses the engine evaluation when given, beyond the win % cap', () => {
    // Both +10 and +15 are 97.5 % on lichess' capped curve; the evaluations still differ.
    const capped = { winBefore: 97.5, winAfter: 97.5, rating: 1500 }
    expect(expectedPointsLost(capped)).toBe(0)
    expect(expectedPointsLost({ ...capped, evalBefore: 1500, evalAfter: 1000 })).toBeGreaterThan(0)
  })

  it('computes the loss in expected points and never below 0', () => {
    expect(expectedPointsLost({ winBefore: 60, winAfter: 45 }, lichess)).toBeCloseTo(0.15)
    expect(expectedPointsLost({ winBefore: 40, winAfter: 60 }, lichess)).toBe(0)
  })

  it('weighs the same drop in evaluation less for weaker players', () => {
    const drop = { winBefore: 75, winAfter: 40 }
    const at = (rating: number) => expectedPointsLost({ ...drop, rating })
    expect(at(400)).toBeCloseTo(at(500)) // constant below 500 ...
    expect(at(500)).toBeLessThan(at(1200))
    expect(at(1200)).toBeLessThan(at(2000))
    expect(at(2000)).toBeCloseTo(at(2800)) // ... and above 2000
    expect(at(2000)).toBeLessThan(0.35) // still flatter than lichess' 0.35 at the top
    expect(expectedPointsLost(drop)).toBeCloseTo(at(1500)) // unknown rating: 1500
    // A blunder for a 2000 player is only a mistake for a beginner.
    const collapse = { winBefore: 60, winAfter: 25 }
    expect(classifyMove({ ...quiet, ...collapse, rating: 2000 })).toBe('blunder')
    expect(classifyMove({ ...quiet, ...collapse, rating: 500 })).toBe('mistake')
  })

  it('counts a move that loses next to nothing as best, not only the engine’s top move', () => {
    expect(classifyMove({ ...quiet, winBefore: 55, winAfter: 54.95 })).toBe('best')
    expect(classifyMove({ ...quiet, winBefore: 55, winAfter: 54 })).toBe('excellent')
  })
})

describe('classifyMove: special classes', () => {
  it('the only legal move is best, and book wins over everything else', () => {
    expect(move({ legalMoves: 1, winAfter: 5 })).toBe('best')
    expect(move({ legalMoves: 1, sacrificeTaken: 5 })).toBe('best')
    expect(move({ inBook: true, winAfter: 50 })).toBe('book')
  })

  it('best = the engine’s top move', () => {
    expect(move({ isBestMove: true })).toBe('best')
  })

  it('great = the only good move that punishes a mistake, not a recapture or an escape from check', () => {
    const punish = { isBestMove: true, opponentLoss: 0.2 }
    expect(move({ ...punish, secondBestWin: 40 })).toBe('great')
    expect(move({ ...punish, secondBestWin: 44 })).toBe('best')
    expect(move({ ...punish, secondBestWin: 20, isRecapture: true })).toBe('best')
    expect(move({ ...punish, secondBestWin: 20, inCheck: true })).toBe('best')
    // The only good move in a quiet position is just best.
    expect(move({ isBestMove: true, secondBestWin: 20, opponentLoss: 0.02 })).toBe('best')
    // The only winning move is great, even though the position counts as won with it ...
    expect(move({ ...punish, winBefore: 97, winAfter: 97, secondBestWin: 60 })).toBe('great')
    // ... but not when another move wins as well.
    expect(move({ ...punish, winBefore: 97, winAfter: 97, secondBestWin: 92 })).toBe('best')
  })

  it('brilliant without a human-move model = a sacrifice the engine takes, not already winning', () => {
    expect(move({ isBestMove: true, sacrificeTaken: 3, winBefore: 60, winAfter: 62 })).toBe(
      'brilliant',
    )
    expect(move({ sacrificeTaken: 3, winBefore: 60, winAfter: 59 })).toBe('brilliant')
    expect(move({ sacrificeTaken: 1, winBefore: 60, winAfter: 60 })).toBe('excellent')
    expect(move({ sacrificeTaken: 3, winBefore: 95, winAfter: 95 })).toBe('excellent') // winning anyway
    expect(move({ sacrificeTaken: 3, winBefore: 40, winAfter: 40 })).toBe('excellent') // worse after
    expect(move({ sacrificeTaken: 3, winBefore: 60, winAfter: 45 })).toBe('mistake') // unsound
    // Material merely left en prise isn't enough without the model to judge how hard it was.
    expect(move({ isBestMove: true, sacrifice: 3, winBefore: 60, winAfter: 60 })).toBe('best')
  })

  it('brilliant with a human-move model = material left for the taking, rarely found', () => {
    const offered = { isBestMove: true, sacrifice: 3, winBefore: 60, winAfter: 60 }
    expect(move({ ...offered, humanProbability: 0.05 })).toBe('brilliant')
    expect(move({ ...offered, humanProbability: 0.4 })).toBe('best') // most players find it
    expect(move({ ...offered, sacrifice: 1, humanProbability: 0.05 })).toBe('best')
  })

  it('with the model, "winning anyway" is judged by the second-best move', () => {
    const onlyWin = {
      isBestMove: true,
      sacrifice: 3,
      winBefore: 97,
      winAfter: 97,
      humanProbability: 0.05,
    }
    expect(move({ ...onlyWin, secondBestWin: 55 })).toBe('brilliant') // the only winning move
    expect(move({ ...onlyWin, secondBestWin: 95 })).toBe('best') // another move wins as well
  })

  it('a sacrifice played out of check or by promoting is not brilliant', () => {
    const sacrifice = {
      isBestMove: true,
      sacrifice: 3,
      sacrificeTaken: 3,
      winBefore: 60,
      winAfter: 60,
    }
    expect(move({ ...sacrifice, inCheck: true })).toBe('best')
    expect(move({ ...sacrifice, isPromotion: true })).toBe('best')
    expect(move({ ...sacrifice, humanProbability: 0.05, inCheck: true })).toBe('best')
  })

  it('miss = giving back about what the opponent’s mistake offered, however much that is', () => {
    expect(move({ opponentLoss: 0.25, winBefore: 80, winAfter: 66 })).toBe('miss') // 0.14 of 0.25
    expect(move({ opponentLoss: 0.4, winBefore: 85, winAfter: 50 })).toBe('miss') // 0.35, a blunder's size
    expect(move({ opponentLoss: 0.25, winBefore: 80, winAfter: 76 })).toBe('good') // keeps most of it
    expect(move({ opponentLoss: 0.05, winBefore: 80, winAfter: 66 })).toBe('mistake') // no real chance
    expect(move({ opponentLoss: 0.15, winBefore: 80, winAfter: 20 })).toBe('blunder') // far more than given
  })
})
