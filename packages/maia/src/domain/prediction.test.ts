import { describe, expect, it } from 'vitest'
import { MOVE_COUNT, encodePosition, moveIndex } from './encoding'
import { decodePrediction } from './prediction'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('decodePrediction', () => {
  it('spreads probability over the legal moves only, most likely first', () => {
    const position = encodePosition(START)
    const logits = new Float32Array(MOVE_COUNT).fill(-5)
    logits[moveIndex('e2e4')!] = 3
    logits[moveIndex('d2d4')!] = 2
    logits[moveIndex('e2e5')!] = 50 // illegal: must not count
    const { moves, expectedScore } = decodePrediction(position, logits, [0, 0, 0])
    expect(moves).toHaveLength(20)
    expect(moves[0]!.move).toBe('e2e4')
    expect(moves[1]!.move).toBe('d2d4')
    expect(moves.reduce((sum, m) => sum + m.probability, 0)).toBeCloseTo(1)
    expect(moves[0]!.probability / moves[1]!.probability).toBeCloseTo(Math.E)
    expect(expectedScore).toBeCloseTo(0.5)
  })

  it('reads the value head as loss, draw, win for the side to move', () => {
    const position = encodePosition(START)
    const logits = new Float32Array(MOVE_COUNT)
    expect(decodePrediction(position, logits, [0, 0, 10]).expectedScore).toBeGreaterThan(0.99)
    expect(decodePrediction(position, logits, [10, 0, 0]).expectedScore).toBeLessThan(0.01)
    expect(decodePrediction(position, logits, [0, 10, 0]).expectedScore).toBeCloseTo(0.5)
  })
})
