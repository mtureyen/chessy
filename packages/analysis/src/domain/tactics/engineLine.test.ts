import { describe, expect, it } from 'vitest'
import { cutEngineLine } from './engineLine'
import { allThemes, engineLineThemes } from './tagThemes'

function cut(fen: string, moves: string, minGain?: number): string | undefined {
  return cutEngineLine({ fen, moves: moves.split(' ') }, minGain)?.moves.join(' ')
}

/** Black's knight goes to d5, where the rook takes it for nothing. */
const HANGING = '4k3/8/5n2/8/8/8/8/3RK3 b - - 0 1'

describe('cutEngineLine', () => {
  it('ends the line at the move that banks the gain', () => {
    expect(cut(HANGING, 'f6d5 d1d5 e8e7 d5d1 e7e6 d1d2 e6e5')).toBe('f6d5 d1d5')
  })

  it('finds no tactic in a line that wins nothing', () => {
    expect(cut(HANGING, 'f6g4 d1d2 e8e7 d2d1 e7e6')).toBeUndefined()
  })

  it('does not count a piece that is taken back', () => {
    // Rxd5 exd5: a rook for a knight.
    expect(cut('4k3/8/4pn2/8/8/8/8/3RK3 b - - 0 1', 'f6d5 d1d5 e6d5 e1e2 e8e7')).toBeUndefined()
  })

  it('does not count taking back what the opponent’s move took', () => {
    // ...Nxd5 took a knight; Rxd5 only restores the balance.
    expect(cut('4k3/8/5n2/3N4/8/8/8/3RK3 b - - 0 1', 'f6d5 d1d5 e8e7 d5d1')).toBeUndefined()
  })

  it('does not count a gain the line shows no answer to', () => {
    expect(cut(HANGING, 'f6d5 d1d5')).toBeUndefined()
    expect(cut(HANGING, 'f6d5 d1d5 e8e7')).toBe('f6d5 d1d5')
  })

  it('wants more than a pawn, unless told otherwise', () => {
    const fen = '4k3/8/4p3/8/8/8/8/3RK3 b - - 0 1'
    expect(cut(fen, 'e6e5 d1d5 e8e7 d5e5 e7f6 e5a5')).toBeUndefined()
    expect(cut(fen, 'e6e5 d1d5 e8e7 d5e5 e7f6 e5a5', 1)).toBe('e6e5 d1d5 e8e7 d5e5')
  })

  it('goes on while the next move wins more', () => {
    // Rxc8+ wins the bishop, and after ...Ke7 the rook on h8 as well.
    const fen = '2b1k2r/7p/8/8/8/8/8/2R1K3 b - - 0 1'
    expect(cut(fen, 'h7h6 c1c8 e8e7 c8h8 e7e6 e1e2 e6e5')).toBe('h7h6 c1c8 e8e7 c8h8')
  })

  it('stops before a trade that follows the gain', () => {
    // After the knight is won, the rooks come off on a8: nothing more is gained.
    const fen = 'rk6/8/5n2/8/8/8/8/R2RK3 b - - 0 1'
    expect(cut(fen, 'f6d5 d1d5 b8b7 a1a8 b7a8 d5d1')).toBe('f6d5 d1d5')
  })

  it('counts a sacrifice that pays off later', () => {
    // Rh8+ Kxh8, Nf7+ and Nxd8: down a rook first, up a queen for it in the end.
    const fen = '3q2k1/p5p1/8/6N1/8/8/8/6KR b - - 0 1'
    expect(cut(fen, 'a7a6 h1h8 g8h8 g5f7 h8g8 f7d8 g8f8 d8e6 f8e7')).toBe(
      'a7a6 h1h8 g8h8 g5f7 h8g8 f7d8',
    )
  })

  it('keeps a line that mates whole, whatever it wins on the way', () => {
    // Rd8+ Rxd8 Rxd8#.
    const fen = 'r5k1/p4ppp/8/8/8/8/3R1PPP/3R2K1 b - - 0 1'
    expect(cut(fen, 'a7a6 d2d8 a8d8 d1d8')).toBe('a7a6 d2d8 a8d8 d1d8')
  })

  it('finds no tactic in a line that cannot be played', () => {
    expect(cut(HANGING, 'f6d5 d1h5')).toBeUndefined()
    expect(cut('nonsense', 'e2e4')).toBeUndefined()
  })
})

describe('engineLineThemes', () => {
  it('tags the tactic and not the play after it', () => {
    // After the knight is won, the engine's line pushes a pawn to the seventh rank.
    const line = {
      fen: '4k3/8/5n2/4P3/8/8/8/3RK3 b - - 0 1',
      moves: 'f6d5 d1d5 e8e7 e5e6 e7e8 e6e7'.split(' '),
    }
    expect(allThemes(line)).toContain('advancedPawn')
    expect(engineLineThemes(line)).toEqual(['hangingPiece'])
  })

  it('finds a skewer that starts with a capture', () => {
    const line = {
      fen: '2b1k2r/7p/8/8/8/8/8/2R1K3 b - - 0 1',
      moves: 'h7h6 c1c8 e8e7 c8h8 e7e6 e1e2'.split(' '),
    }
    expect(engineLineThemes(line)).toEqual(expect.arrayContaining(['hangingPiece', 'skewer']))
  })

  it('has no themes for a line that wins nothing', () => {
    expect(engineLineThemes({ fen: HANGING, moves: 'f6g4 d1d2 e8e7 d2d1'.split(' ') })).toEqual([])
  })
})
