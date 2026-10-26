import { INITIAL_FEN } from 'chessops/fen'
import { describe, expect, it } from 'vitest'
import { createGame, InvalidPositionError, type GameState } from './game'

function playAll(game: GameState, moves: string): void {
  for (const move of moves.split(' ')) {
    if (!game.play(move)) throw new Error(`illegal in test setup: ${move}`)
  }
}

describe('basics', () => {
  it('starts from the initial position', () => {
    const game = createGame()
    expect(game.fen()).toBe(INITIAL_FEN)
    expect(game.turn()).toBe('white')
    expect(game.legalMoves()).toHaveLength(20)
    expect(game.status()).toEqual({ kind: 'ongoing' })
  })

  it('plays moves given as SAN, UCI or object', () => {
    const game = createGame()
    expect(game.play('e4')?.move?.uci).toBe('e2e4')
    expect(game.play('e7e5')?.move?.san).toBe('e5')
    expect(game.play({ from: 'g1', to: 'f3' })?.move?.san).toBe('Nf3')
    expect(game.current.move).toMatchObject({ color: 'white', moveNumber: 2 })
  })

  it('rejects illegal moves without changing state', () => {
    const game = createGame()
    const before = game.current
    expect(game.play('e5')).toBeUndefined()
    expect(game.play('e2e5')).toBeUndefined()
    expect(game.play({ from: 'e7', to: 'e5' })).toBeUndefined()
    expect(game.play('nonsense')).toBeUndefined()
    expect(game.current).toBe(before)
  })

  it('rejects a move that leaves the own king in check', () => {
    // White king on e1 pinned along the e-file: the e2 knight may not move.
    const game = createGame('4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1')
    expect(game.play('Nc3')).toBeUndefined()
    expect(game.play('Kd1')).toBeDefined()
  })

  it('throws on invalid FEN', () => {
    expect(() => createGame('not a fen')).toThrow(InvalidPositionError)
    expect(() => createGame('8/8/8/8/8/8/8/8 w - - 0 1')).toThrow(InvalidPositionError)
  })
})

describe('castling', () => {
  const open = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1'

  it('castles both sides, written as king moves', () => {
    const game = createGame(open)
    const short = game.play('e1g1')
    expect(short?.move).toMatchObject({ san: 'O-O', uci: 'e1g1', from: 'e1', to: 'g1' })
    expect(short?.fen.split(' ')[0]).toBe('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1')
    const long = game.play('O-O-O')
    expect(long?.move?.uci).toBe('e8c8')
    expect(long?.fen.split(' ')[0]).toBe('2kr3r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1')
  })

  it('accepts king-onto-rook input and normalizes it', () => {
    const game = createGame(open)
    expect(game.play({ from: 'e1', to: 'h1' })?.move?.uci).toBe('e1g1')
  })

  it('lists castling once, as king move', () => {
    const uci = createGame(open)
      .legalMoves()
      .filter((m) => m.from === 'e1')
      .map((m) => m.to)
    expect(uci.sort()).toEqual(['c1', 'd1', 'f1', 'g1'])
  })

  it('may not castle through an attacked square', () => {
    const game = createGame('k4r2/8/8/8/8/8/8/4K2R w K - 0 1')
    expect(game.play('O-O')).toBeUndefined()
  })

  it('may not castle out of check', () => {
    const game = createGame('k3r3/8/8/8/8/8/8/4K2R w K - 0 1')
    expect(game.play('O-O')).toBeUndefined()
  })

  it('may not castle into check', () => {
    const game = createGame('k5r1/8/8/8/8/8/8/4K2R w K - 0 1')
    expect(game.play('O-O')).toBeUndefined()
  })

  it('loses the right after the king moved', () => {
    const game = createGame(open)
    playAll(game, 'Kf1 a6 Ke1 a5')
    expect(game.play('O-O')).toBeUndefined()
  })

  it('loses one side after that rook moved', () => {
    const game = createGame(open)
    playAll(game, 'Rg1 a6 Rh1 a5')
    expect(game.play('O-O')).toBeUndefined()
    expect(game.play('O-O-O')).toBeDefined()
  })
})

describe('en passant', () => {
  it('captures right after the double step and removes the pawn', () => {
    const game = createGame()
    playAll(game, 'e4 a6 e5 d5')
    const node = game.play('exd6')
    expect(node?.move?.san).toBe('exd6')
    expect(node?.fen.split(' ')[0]).toBe('rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR')
  })

  it('expires one move later', () => {
    const game = createGame()
    playAll(game, 'e4 a6 e5 d5 h3 h6')
    expect(game.play('exd6')).toBeUndefined()
  })

  it('is illegal when it exposes the king along the rank', () => {
    const game = createGame('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1')
    expect(game.play('exd6')).toBeUndefined()
  })
})

describe('promotion', () => {
  const fen = '1n5k/P7/8/8/8/8/8/K7 w - - 0 1'

  it('requires choosing a piece', () => {
    const game = createGame(fen)
    expect(game.isPromotion('a7', 'a8')).toBe(true)
    expect(game.isPromotion('a1', 'a2')).toBe(false)
    expect(game.play({ from: 'a7', to: 'a8' })).toBeUndefined()
  })

  it('offers all four pieces, for pushes and captures', () => {
    const promotions = createGame(fen)
      .legalMoves()
      .filter((m) => m.from === 'a7')
      .map((m) => `${m.to}${m.promotion}`)
    expect(promotions.sort()).toEqual([
      'a8bishop',
      'a8knight',
      'a8queen',
      'a8rook',
      'b8bishop',
      'b8knight',
      'b8queen',
      'b8rook',
    ])
  })

  it('underpromotes', () => {
    const game = createGame(fen)
    expect(game.play({ from: 'a7', to: 'b8', promotion: 'knight' })?.move?.san).toBe('axb8=N')
    expect(game.fen().split(' ')[0]).toBe('1N5k/8/8/8/8/8/8/K7')
  })
})

describe('game end', () => {
  it('detects checkmate', () => {
    const game = createGame()
    playAll(game, 'f3 e5 g4 Qh4#')
    expect(game.current.move?.san).toBe('Qh4#')
    expect(game.isCheck()).toBe(true)
    expect(game.status()).toEqual({ kind: 'checkmate', winner: 'black' })
    expect(game.legalMoves()).toHaveLength(0)
  })

  it('detects stalemate', () => {
    const game = createGame('k7/8/8/1Q6/8/8/8/7K w - - 0 1')
    playAll(game, 'Qb6')
    expect(game.isCheck()).toBe(false)
    expect(game.status()).toEqual({ kind: 'draw', reason: 'stalemate' })
  })

  it('detects insufficient material', () => {
    const game = createGame('k7/8/8/8/8/8/1r6/K7 w - - 0 1')
    playAll(game, 'Kxb2')
    expect(game.status()).toEqual({ kind: 'draw', reason: 'insufficient-material' })
    expect(createGame('k7/8/8/8/8/8/8/KR6 w - - 0 1').status().kind).toBe('ongoing')
  })

  it('detects threefold repetition, not before', () => {
    const game = createGame()
    playAll(game, 'Nf3 Nf6 Ng1 Ng8')
    expect(game.status().kind).toBe('ongoing')
    playAll(game, 'Nf3 Nf6 Ng1 Ng8')
    expect(game.status()).toEqual({ kind: 'draw', reason: 'threefold-repetition' })
  })

  it('detects the fifty-move rule', () => {
    const game = createGame('7k/8/8/8/8/8/R7/K7 w - - 99 60')
    playAll(game, 'Ra3')
    expect(game.status()).toEqual({ kind: 'draw', reason: 'fifty-move-rule' })
  })

  it('lets checkmate on the 100th half-move win over the fifty-move rule', () => {
    const game = createGame('7k/6pp/8/8/8/8/8/R5K1 w - - 99 60')
    playAll(game, 'Ra8#')
    expect(game.status()).toEqual({ kind: 'checkmate', winner: 'white' })
  })

  it('reports the status of any node', () => {
    const game = createGame()
    playAll(game, 'f3 e5 g4 Qh4#')
    const mate = game.current
    game.toStart()
    expect(game.status().kind).toBe('ongoing')
    expect(game.status(mate).kind).toBe('checkmate')
  })
})

describe('move tree & navigation', () => {
  it('navigates back and forth', () => {
    const game = createGame()
    playAll(game, 'e4 e5 Nf3')
    expect(game.back()).toBe(true)
    expect(game.current.move?.san).toBe('e5')
    game.toStart()
    expect(game.current).toBe(game.root)
    expect(game.back()).toBe(false)
    expect(game.forward()).toBe(true)
    game.toEnd()
    expect(game.current.move?.san).toBe('Nf3')
  })

  it('reuses an existing move instead of duplicating it', () => {
    const game = createGame()
    playAll(game, 'e4 e5')
    game.toStart()
    const again = game.play('e4')
    expect(again).toBe(game.root.children[0])
    expect(game.root.children).toHaveLength(1)
  })

  it('adds a different move as a variation', () => {
    const game = createGame()
    playAll(game, 'e4 e5')
    game.toStart()
    playAll(game, 'd4')
    expect(game.root.children.map((c) => c.move?.san)).toEqual(['e4', 'd4'])
    expect(game.line().map((n) => n.move?.san)).toEqual(['d4'])
  })

  it('line() shows the path plus the main continuation', () => {
    const game = createGame()
    playAll(game, 'e4 e5 Nf3 Nc6')
    game.toStart()
    game.forward()
    expect(game.line().map((n) => n.move?.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
  })

  it('takeback removes the move and what follows', () => {
    const game = createGame()
    playAll(game, 'e4 e5 Nf3')
    game.back()
    expect(game.takeback()).toBe(true)
    expect(game.current.move?.san).toBe('e4')
    expect(game.current.children).toHaveLength(0)
    game.toStart()
    expect(game.takeback()).toBe(false)
  })

  it('refuses nodes from another game', () => {
    const other = createGame()
    expect(() => createGame().goTo(other.root)).toThrow()
  })
})
