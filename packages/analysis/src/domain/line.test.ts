import { describe, expect, it } from 'vitest'
import { formatSanLine, toSanLine } from './line'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('toSanLine', () => {
  it('converts a UCI line into SAN with move numbers', () => {
    const line = toSanLine(START, ['e2e4', 'e7e5', 'g1f3'])
    expect(line).toEqual([
      { uci: 'e2e4', san: 'e4', color: 'white', moveNumber: 1 },
      { uci: 'e7e5', san: 'e5', color: 'black', moveNumber: 1 },
      { uci: 'g1f3', san: 'Nf3', color: 'white', moveNumber: 2 },
    ])
  })

  it('handles castling, promotion and a maximum length', () => {
    expect(
      toSanLine('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['e1g1', 'e8c8']).map((m) => m.san),
    ).toEqual(['O-O', 'O-O-O'])
    expect(toSanLine('7k/P7/8/8/8/8/8/K7 w - - 0 1', ['a7a8q']).map((m) => m.san)).toEqual([
      'a8=Q+',
    ])
    expect(toSanLine(START, ['e2e4', 'e7e5', 'g1f3'], 2)).toHaveLength(2)
  })

  it('stops at the first illegal move', () => {
    expect(toSanLine(START, ['e2e4', 'e2e4', 'g1f3']).map((m) => m.san)).toEqual(['e4'])
  })
})

describe('formatSanLine', () => {
  it('numbers lines starting with White or Black', () => {
    expect(formatSanLine(toSanLine(START, ['e2e4', 'e7e5', 'g1f3']))).toBe('1. e4 e5 2. Nf3')
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    expect(formatSanLine(toSanLine(afterE4, ['c7c5', 'g1f3']))).toBe('1... c5 2. Nf3')
    expect(formatSanLine([])).toBe('')
  })
})
