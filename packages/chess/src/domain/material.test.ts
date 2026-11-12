import { describe, expect, it } from 'vitest'
import { createGame } from './game'
import { hasInsufficientMaterial, materialBalance, materialOf, type TakenRole } from './material'

describe('materialBalance', () => {
  it('is 0 at the start and counts from White’s side', () => {
    expect(materialBalance('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(0)
    expect(materialBalance('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(9)
    expect(materialBalance('4k3/8/8/8/8/8/8/3RK3 w - - 0 1')).toBe(5)
    expect(materialBalance('4k3/1n6/8/8/8/8/P7/4K3 w - - 0 1')).toBe(-2)
  })
})

describe('hasInsufficientMaterial', () => {
  it('tells per side whether it can still mate', () => {
    const kingVsQueen = '4k3/8/8/8/8/8/8/3QK3 w - - 0 1'
    expect(hasInsufficientMaterial(kingVsQueen, 'black')).toBe(true)
    expect(hasInsufficientMaterial(kingVsQueen, 'white')).toBe(false)
    const knightVsPawn = '4k3/4p3/8/8/8/8/8/1N2K3 w - - 0 1'
    expect(hasInsufficientMaterial(knightVsPawn, 'white')).toBe(false) // the pawn can block
    expect(hasInsufficientMaterial('4k3/8/8/8/8/8/8/1N2K3 w - - 0 1', 'white')).toBe(true)
    expect(() => hasInsufficientMaterial('nonsense', 'white')).toThrow()
  })
})

describe('materialOf', () => {
  /** A list with only the types named; the rest are 0. */
  const pieces = (some: Partial<Record<TakenRole, number>> = {}) => ({
    pawn: 0,
    knight: 0,
    bishop: 0,
    rook: 0,
    queen: 0,
    ...some,
  })
  /** The positions of a game: its start (a FEN, or the usual one) and the one after each move. */
  const game = (moves: string[], fen?: string) => {
    const state = createGame(fen)
    return [
      state.root.fen,
      ...moves.map((uci) => {
        const node = state.play(uci)
        if (!node) throw new Error(`Illegal move: ${uci}`)
        return node.fen
      }),
    ]
  }

  it('lists nothing at the start', () => {
    expect(materialOf(game([]))).toEqual({
      kind: 'taken',
      white: { pieces: pieces(), lead: 0 },
      black: { pieces: pieces(), lead: 0 },
    })
  })

  it('lists what each side took, and the lead on the side that is ahead', () => {
    // 1. e4 d5 2. exd5 Qxd5 3. Nc3 Qxa2 4. Nxa2: two pawns for a queen and a pawn.
    const positions = game(['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5a2', 'c3a2'])
    const material = materialOf(positions)
    expect(material.kind).toBe('taken')
    expect(material.white).toEqual({ pieces: pieces({ pawn: 1, queen: 1 }), lead: 8 })
    expect(material.black).toEqual({ pieces: pieces({ pawn: 2 }), lead: 0 })

    // Stepping back through the game gives what had been taken by then.
    const earlier = materialOf(positions.slice(0, 5))
    expect(earlier.white).toEqual({ pieces: pieces({ pawn: 1 }), lead: 0 })
    expect(earlier.black).toEqual({ pieces: pieces({ pawn: 1 }), lead: 0 })
  })

  it('keeps an even trade in both lists', () => {
    // 1. e4 d5 2. exd5 Qxd5 3. Nc3 Qe5+ 4. Qe2 Qxe2+ 5. Bxe2
    const material = materialOf(
      game(['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5e5', 'd1e2', 'e5e2', 'f1e2']),
    )
    expect(material.white).toEqual({ pieces: pieces({ pawn: 1, queen: 1 }), lead: 0 })
    expect(material.black).toEqual({ pieces: pieces({ pawn: 1, queen: 1 }), lead: 0 })
  })

  it('counts a pawn taken en passant', () => {
    const material = materialOf(game(['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6']))
    expect(material.white).toEqual({ pieces: pieces({ pawn: 1 }), lead: 1 })
  })

  it('does not list a pawn that promotes, and lists the new piece when it is taken', () => {
    // Both queens were traded long ago; White's pawn queens, and Black's rook takes the queen.
    const positions = game(['a7a8q', 'h8a8'], '7r/P6k/8/8/8/8/8/K7 w - - 0 1')
    const [start, queened, taken] = [1, 2, 3].map((n) => materialOf(positions.slice(0, n)))
    const blackTook = pieces({ pawn: 7, knight: 2, bishop: 2, rook: 2, queen: 1 })

    expect(start!.black).toEqual({ pieces: blackTook, lead: 4 })
    expect(queened!.kind).toBe('taken')
    expect(queened!.black).toEqual({ pieces: blackTook, lead: 0 })
    expect(queened!.white.lead).toBe(4)
    expect(taken!.black).toEqual({ pieces: { ...blackTook, queen: 2 }, lead: 5 })
  })

  it('takes a second queen in the first position for a promoted pawn', () => {
    // White's h-pawn took its way to a8 and queened; its own queen's rook never moved.
    const material = materialOf(['Qnbqkbnr/1ppppppp/8/8/8/8/PPPPPPP1/RNBQKBNR b KQk - 0 1'])
    expect(material.kind).toBe('taken')
    expect(material.white).toEqual({ pieces: pieces({ pawn: 1, rook: 1 }), lead: 14 })
    expect(material.black).toEqual({ pieces: pieces(), lead: 0 })
  })

  it('measures a position that was set up against full sets', () => {
    const material = materialOf(['4k3/8/8/8/8/8/4P3/3RK3 w - - 0 1'])
    expect(material.kind).toBe('taken')
    expect(material.white).toEqual({
      pieces: pieces({ pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1 }),
      lead: 6,
    })
    expect(material.black).toEqual({
      pieces: pieces({ pawn: 7, knight: 2, bishop: 2, rook: 1, queen: 1 }),
      lead: 0,
    })
  })

  it('lists who has more of what when the first position cannot come from full sets', () => {
    // Three queens and all eight pawns: no pawn was there to promote.
    const queens = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/QNBQKBNQ w kq - 0 1'
    expect(materialOf([queens])).toEqual({
      kind: 'extra',
      white: { pieces: pieces({ queen: 2 }), lead: 8 },
      black: { pieces: pieces({ rook: 2 }), lead: 0 },
    })
    // It stays that way as the game goes on: Qxa7 leaves Black a pawn short.
    expect(
      materialOf(game(['a2a4', 'h7h6', 'a4a5', 'h6h5', 'a5a6', 'h5h4', 'a6b7'], queens)),
    ).toEqual({
      kind: 'extra',
      white: { pieces: pieces({ pawn: 1, queen: 2 }), lead: 9 },
      black: { pieces: pieces({ rook: 2 }), lead: 0 },
    })

    const pawns = materialOf(['4k3/pp6/8/8/8/P7/PPPPPPPP/4K3 w - - 0 1'])
    expect(pawns.kind).toBe('extra')
    expect(pawns.white).toEqual({ pieces: pieces({ pawn: 7 }), lead: 7 })
    expect(pawns.black).toEqual({ pieces: pieces(), lead: 0 })
  })

  it('rejects an invalid FEN and an empty list', () => {
    expect(() => materialOf(['nonsense'])).toThrow()
    expect(() => materialOf([])).toThrow()
  })
})
