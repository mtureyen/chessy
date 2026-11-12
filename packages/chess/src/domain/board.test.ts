import { describe, expect, it } from 'vitest'
import { boardView, squareAt, squareCoords, squareDistance, squaresBetween } from './board'

describe('boardView', () => {
  it('tells what stands where and whose turn it is', () => {
    const board = boardView('4k3/8/8/4n3/8/8/1B6/4K3 w - - 0 1')
    expect(board.turn).toBe('white')
    expect(board.pieceAt('e5')).toEqual({ role: 'knight', color: 'black' })
    expect(board.pieceAt('e4')).toBeUndefined()
    expect(board.kingOf('black')).toBe('e8')
    expect(board.pieces()).toHaveLength(4)
  })

  it('rejects a FEN that is no legal position', () => {
    expect(() => boardView('nonsense')).toThrow()
    expect(() => boardView('8/8/8/8/8/8/8/8 w - - 0 1')).toThrow()
  })

  it('lists the squares a piece attacks, its own side’s pieces included', () => {
    // The rook sees up the a-file to its own pawn and along the rank to the king.
    const board = boardView('4k3/8/8/8/8/P7/8/R3K3 w - - 0 1')
    expect(board.attacksFrom('a1').sort()).toEqual(['a2', 'a3', 'b1', 'c1', 'd1', 'e1'])
    expect(board.attacksFrom('h8')).toEqual([])
  })

  it('finds the attackers of a square, and what stands behind one of them', () => {
    // Rooks doubled on the e-file: only the front one attacks e5 until it is taken away.
    const board = boardView('4k3/8/8/4p3/8/8/4R3/4RK2 w - - 0 1')
    expect(board.attackers('e5', 'white')).toEqual(['e2'])
    expect(board.attackers('e5', 'white', 'e2')).toEqual(['e1'])
    expect(board.attackers('e5', 'black')).toEqual([])
  })

  it('counts a pinned piece as an attacker', () => {
    // The knight on e2 is pinned by the rook on e8 and still attacks d4.
    const board = boardView('4r1k1/8/8/8/3p4/8/4N3/4K3 w - - 0 1')
    expect(board.attackers('d4', 'white')).toEqual(['e2'])
  })

  it('gives the line of a pin, and nothing for a piece that is free', () => {
    const board = boardView('4r1k1/8/8/8/3p4/8/4N3/3BK3 w - - 0 1')
    expect(board.pinLine('e2')).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'])
    expect(board.pinLine('d1')).toBeUndefined()
    // Two pieces between king and rook: neither is pinned.
    const shielded = boardView('4r1k1/8/8/8/8/4B3/4N3/4K3 w - - 0 1')
    expect(shielded.pinLine('e2')).toBeUndefined()
    expect(shielded.pinLine('e3')).toBeUndefined()
  })

  it('sees a pin along a diagonal, but not by a piece that does not move that way', () => {
    expect(boardView('6k1/8/8/7b/8/5N2/8/3K4 w - - 0 1').pinLine('f3')).toContain('h5')
    expect(boardView('6k1/8/8/7r/8/5N2/8/3K4 w - - 0 1').pinLine('f3')).toBeUndefined()
  })

  it('reports check, the checking pieces and mate', () => {
    // A discovered double check: knight on f6 and bishop on b5.
    const double = boardView('4k3/8/5N2/1B6/8/8/8/4K3 b - - 0 1')
    expect(double.isCheck()).toBe(true)
    expect(double.checkers().sort()).toEqual(['b5', 'f6'])
    expect(double.isCheckmate()).toBe(false)
    expect(boardView('R5k1/5ppp/8/8/8/8/8/4K3 b - - 0 1').isCheckmate()).toBe(true)
  })

  it('lists legal moves with castling as the king’s move', () => {
    const board = boardView('4k3/8/8/8/8/8/8/4K2R w K - 0 1')
    expect(board.legalMoves()).toContainEqual({ from: 'e1', to: 'g1' })
  })

  it('gives the moves of a pinned piece when the king’s safety is left aside', () => {
    const board = boardView('4r1k1/8/8/8/3p4/8/4N3/4K3 w - - 0 1')
    expect(board.legalMoves().filter((move) => move.from === 'e2')).toEqual([])
    expect(board.pseudoLegalDests('e2').sort()).toEqual(['c1', 'c3', 'd4', 'f4', 'g1', 'g3'])
  })

  it('moves pawns forward, takes diagonally and en passant only on its turn', () => {
    const board = boardView('4k3/8/8/3pP3/8/2n5/1P1P4/4K3 w - d6 0 1')
    expect(board.pseudoLegalDests('b2').sort()).toEqual(['b3', 'b4', 'c3'])
    expect(board.pseudoLegalDests('d2').sort()).toEqual(['c3', 'd3', 'd4'])
    expect(board.pseudoLegalDests('e5').sort()).toEqual(['d6', 'e6'])
    expect(board.pseudoLegalDests('d5')).toEqual(['d4'])
  })

  it('plays a move into a new view and leaves the old one alone', () => {
    const board = boardView('4k3/8/8/8/8/8/8/4K2R w K - 0 1')
    const castled = board.play('e1g1')
    expect(castled?.pieceAt('g1')).toEqual({ role: 'king', color: 'white' })
    expect(castled?.pieceAt('f1')).toEqual({ role: 'rook', color: 'white' })
    expect(castled?.turn).toBe('black')
    expect(castled?.fen).toBe('4k3/8/8/8/8/8/8/5RK1 b - - 1 1')
    expect(board.pieceAt('e1')).toEqual({ role: 'king', color: 'white' })
    expect(board.play('e1e3')).toBeUndefined()
    expect(board.play('xx')).toBeUndefined()
  })
})

describe('square geometry', () => {
  it('converts between names and coordinates', () => {
    expect(squareCoords('a1')).toEqual({ file: 0, rank: 0 })
    expect(squareCoords('h8')).toEqual({ file: 7, rank: 7 })
    expect(squareAt(4, 3)).toBe('e4')
    expect(squareAt(8, 0)).toBeUndefined()
    expect(squareAt(0, -1)).toBeUndefined()
  })

  it('measures distance in king moves', () => {
    expect(squareDistance('a1', 'h8')).toBe(7)
    expect(squareDistance('e4', 'f6')).toBe(2)
    expect(squareDistance('e4', 'e4')).toBe(0)
  })

  it('lists the squares between two squares on a line', () => {
    expect(squaresBetween('a1', 'd4')).toEqual(['b2', 'c3'])
    expect(squaresBetween('e1', 'e4')).toEqual(['e2', 'e3'])
    expect(squaresBetween('a1', 'b3')).toEqual([])
    expect(squaresBetween('e1', 'e2')).toEqual([])
  })
})
