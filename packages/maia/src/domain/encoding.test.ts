import { describe, expect, it } from 'vitest'
import { MOVE_COUNT, encodePosition, mirrorMove, moveAt, moveIndex } from './encoding'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

/** Which piece channel is set on a square (a1 = 0), or undefined. */
const pieceAt = (tokens: Float32Array, square: number) => {
  const channel = tokens.slice(square * 12, square * 12 + 12).findIndex((v) => v === 1)
  return channel < 0 ? undefined : 'PNBRQKpnbrqk'[channel]
}

describe('move vocabulary', () => {
  it('numbers from-to pairs first, then promotions from rank 7, as the platform does', () => {
    expect(MOVE_COUNT).toBe(4352)
    expect(moveIndex('a1a1')).toBe(0)
    expect(moveIndex('a1b1')).toBe(1)
    expect(moveIndex('b1a1')).toBe(64)
    expect(moveIndex('h8h8')).toBe(4095)
    expect(moveIndex('a7a8q')).toBe(4096)
    expect(moveIndex('a7b8q')).toBe(4100)
    expect(moveIndex('h7h8n')).toBe(4351)
    expect(moveIndex('a2a1q')).toBeUndefined()
  })

  it('maps every index back to its move', () => {
    for (let i = 0; i < MOVE_COUNT; i++) expect(moveIndex(moveAt(i))).toBe(i)
  })
})

describe('encodePosition', () => {
  it('puts the pieces on their squares with White to move', () => {
    const { tokens, legal, moves, turn } = encodePosition(START)
    expect(turn).toBe('white')
    expect(pieceAt(tokens, 4)).toBe('K') // e1
    expect(pieceAt(tokens, 60)).toBe('k') // e8
    expect(pieceAt(tokens, 28)).toBeUndefined() // e4
    expect(moves).toHaveLength(20)
    expect(legal).toContain(moveIndex('e2e4'))
  })

  it('flips the board and the colours with Black to move, and the moves with them', () => {
    const { tokens, legal, moves, turn } = encodePosition(AFTER_E4)
    expect(turn).toBe('black')
    expect(pieceAt(tokens, 4)).toBe('K') // Black's king, seen as White's on e1
    expect(pieceAt(tokens, 60)).toBe('k') // White's king, now on e8
    expect(pieceAt(tokens, 36)).toBe('p') // White's e4 pawn, seen on e5
    const e5 = moves.indexOf('e7e5')
    expect(legal[e5]).toBe(moveIndex(mirrorMove('e7e5'))) // e2e4 from Black's side
  })

  it('names castling and promotions in standard UCI', () => {
    const castling = encodePosition('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
    expect(castling.moves).toEqual(expect.arrayContaining(['e1g1', 'e1c1']))
    const promotion = encodePosition('8/P7/8/8/8/8/8/k6K w - - 0 1')
    expect(promotion.moves).toEqual(expect.arrayContaining(['a7a8q', 'a7a8n']))
    const blackPromotion = encodePosition('K6k/8/8/8/8/8/p7/8 b - - 0 1')
    const index = blackPromotion.legal[blackPromotion.moves.indexOf('a2a1q')]
    expect(moveAt(index!)).toBe('a7a8q')
  })
})
