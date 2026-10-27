import { describe, expect, it } from 'vitest'
import recorded from './fixtures/lichess-accuracy.json'
import { gameAccuracy, moveAccuracy } from './accuracy'
import { winPercent } from './winPercent'

describe('moveAccuracy', () => {
  it('is 100 when the move keeps or improves the winning chances', () => {
    expect(moveAccuracy(50, 50)).toBe(100)
    expect(moveAccuracy(40, 70)).toBe(100)
  })

  it('drops with the loss in winning chances', () => {
    expect(moveAccuracy(60, 55)).toBeCloseTo(80.82, 2)
    expect(moveAccuracy(80, 40)).toBeCloseTo(15.91, 2)
    expect(moveAccuracy(100, 0)).toBe(0)
  })
})

interface RecordedGame {
  url: string
  accuracy: { white: number; black: number }
  evals: Array<{ cp: number } | { mate: number }>
}
const fixture = recorded as { games: RecordedGame[] }

describe('gameAccuracy reproduces lichess exactly', () => {
  // lichess' analysis starts from Eval.initial (+0.15) for the starting position.
  const INITIAL_CP = 15

  it.each(fixture.games.map((g) => [g.url, g] as const))('%s', (_url, game) => {
    const scores = [{ cp: INITIAL_CP }, ...game.evals].map((e) =>
      'mate' in e
        ? winPercent(
            { type: 'mate', winner: e.mate > 0 ? 'white' : 'black', moves: Math.abs(e.mate) },
            'white',
          )
        : winPercent({ type: 'cp', value: e.cp }, 'white'),
    )
    const accuracy = gameAccuracy(scores)
    expect(Math.round(accuracy.white!)).toBe(game.accuracy.white)
    expect(Math.round(accuracy.black!)).toBe(game.accuracy.black)
  })

  it('handles games starting with Black and very short games', () => {
    expect(gameAccuracy([50, 40], 'black')).toEqual({ black: expect.any(Number) })
    expect(gameAccuracy([50])).toEqual({})
  })
})
