import { describe, expect, it } from 'vitest'
import { mostExposedPiece, staticExchange } from './exchange'

describe('staticExchange', () => {
  it('wins a hanging piece outright', () => {
    // Black knight on e5, attacked by the white bishop on b2, defended by nothing.
    expect(staticExchange('4k3/8/8/4n3/8/8/1B6/4K3 w - - 0 1', 'e5', 'white')).toBe(3)
  })

  it('declines to take a defended piece with a more valuable one', () => {
    // Knight on e5 defended by the d6 pawn; only the white queen attacks it.
    expect(staticExchange('4k3/8/3p4/4n3/8/8/4Q3/4K3 w - - 0 1', 'e5', 'white')).toBe(0)
  })

  it('plays out a trade: knight for knight is even', () => {
    // White knight takes the e5 knight, the d6 pawn takes back.
    expect(staticExchange('4k3/8/3p4/4n3/8/3N4/8/4K3 w - - 0 1', 'e5', 'white')).toBe(0)
  })

  it('counts pieces behind each other (a battery) and the defenders in turn', () => {
    // Doubled white rooks on the e-file against a pawn on e5 defended once by the d6 pawn.
    expect(staticExchange('4k3/8/3p4/4p3/8/8/4R3/4RK2 w - - 0 1', 'e5', 'white')).toBe(0)
    // A queen defended by a pawn, two rooks: Rxe5 dxe5 Rxe5 nets queen and pawn for a rook.
    expect(staticExchange('4k3/8/3p4/4q3/8/8/4R3/4RK2 w - - 0 1', 'e5', 'white')).toBe(5)
  })

  it('lets the king take only an undefended piece', () => {
    expect(staticExchange('4k3/8/8/8/8/8/4n3/4K3 w - - 0 1', 'e2', 'white')).toBe(3)
    expect(staticExchange('4k3/8/8/8/8/3b4/4n3/4K3 w - - 0 1', 'e2', 'white')).toBe(0)
  })

  it('is 0 for empty squares and own pieces', () => {
    expect(staticExchange('4k3/8/8/8/8/8/1B6/4K3 w - - 0 1', 'e5', 'white')).toBe(0)
    expect(staticExchange('4k3/8/8/8/8/8/1B6/4K3 w - - 0 1', 'b2', 'white')).toBe(0)
  })
})

describe('mostExposedPiece', () => {
  it('finds the piece the opponent wins most by taking', () => {
    // White's knight on e5 hangs to the d6 pawn (3); the rook on a1 is safe.
    expect(mostExposedPiece('4k3/8/3p4/4N3/8/8/8/R3K3 b - - 0 1', 'white')).toEqual({
      square: 'e5',
      gain: 3,
      role: 'knight',
    })
  })

  it('ignores pawns and kings, and safe pieces', () => {
    expect(mostExposedPiece('4k3/8/3p4/4P3/8/8/8/R3K3 b - - 0 1', 'white')).toBeUndefined()
    expect(
      mostExposedPiece('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white'),
    ).toBeUndefined()
  })

  it('does not count a piece the opponent cannot take because it is in check', () => {
    // 5. Bg5 attacks Black's queen; 5...Nxf3+ takes a knight with check, so White can't take
    // the queen next move: only the knight on f3 can be taken, which just trades knights.
    const afterCheck = 'r1bqkbnr/pp1p1ppp/4p3/2p3B1/4P3/2NP1n2/PPP2PPP/R2QKB1R w KQkq - 0 6'
    expect(mostExposedPiece(afterCheck, 'black')).toEqual({
      square: 'f3',
      gain: 3,
      role: 'knight',
    })
  })
})
