import { describe, expect, it } from 'vitest'
import { gameLine, lineText } from './line'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('gameLine', () => {
  it('reads the main line of a PGN, without variations', () => {
    const line = gameLine('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *')
    expect(line).toEqual({ startFen: START, moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] })
  })

  it('starts from a FEN header', () => {
    const fen = '8/8/8/8/8/2k5/1q6/4K3 b - - 0 1'
    const line = gameLine(`[SetUp "1"]\n[FEN "${fen}"]\n\n1... Qb1+ *`)
    expect(line.startFen).toBe(fen)
    expect(line.moves).toEqual(['b2b1'])
  })
})

describe('lineText', () => {
  it('is equal for equal lines and differs otherwise', () => {
    const a = gameLine('1. e4 e5 *')
    expect(lineText(a)).toBe(lineText(gameLine('[Event "x"]\n\n1. e4 {comment} e5 *')))
    expect(lineText(a)).not.toBe(lineText(gameLine('1. e4 c5 *')))
  })
})
