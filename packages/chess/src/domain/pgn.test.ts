import { describe, expect, it } from 'vitest'
import { createGame } from './game'
import { exportPgn, importPgn, PgnImportError } from './pgn'

describe('PGN export', () => {
  it('writes moves, headers and the result', () => {
    const game = createGame()
    for (const san of ['f3', 'e5', 'g4', 'Qh4#']) game.play(san)
    const pgn = exportPgn(game, { White: 'Alice', Black: 'Bob' })
    expect(pgn).toContain('[White "Alice"]')
    expect(pgn).toContain('[Result "0-1"]')
    expect(pgn).toContain('1. f3 e5 2. g4 Qh4# 0-1')
  })

  it('keeps a result from the headers while the position is undecided', () => {
    const game = createGame()
    game.play('e4')
    expect(exportPgn(game, { Result: '1-0' })).toContain('1. e4 1-0')
    expect(exportPgn(game)).toContain('1. e4 *')
  })

  it('writes FEN and SetUp for custom starting positions', () => {
    const fen = '7k/6pp/8/8/8/8/8/R5K1 w - - 0 40'
    const game = createGame(fen)
    game.play('Ra8#')
    const pgn = exportPgn(game)
    expect(pgn).toContain('[SetUp "1"]')
    expect(pgn).toContain(`[FEN "${fen}"]`)
    expect(pgn).toContain('40. Ra8# 1-0')
  })

  it('writes variations', () => {
    const game = createGame()
    game.play('e4')
    game.play('e5')
    game.toStart()
    game.play('d4')
    expect(exportPgn(game)).toContain('1. e4 ( 1. d4 ) 1... e5')
  })
})

describe('PGN import', () => {
  it('reads moves and headers, cursor on the last move', () => {
    const { game, headers } = importPgn(
      '[White "Alice"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
    )
    expect(headers.White).toBe('Alice')
    expect(game.current.move?.san).toBe('Qxf7#')
    expect(game.status()).toEqual({ kind: 'checkmate', winner: 'white' })
  })

  it('reads variations into the tree', () => {
    const { game } = importPgn('1. e4 (1. d4 d5 (1... Nf6)) e5 *')
    expect(game.root.children.map((c) => c.move?.san)).toEqual(['e4', 'd4'])
    expect(game.root.children[1]?.children.map((c) => c.move?.san)).toEqual(['d5', 'Nf6'])
    expect(game.line().map((n) => n.move?.san)).toEqual(['e4', 'e5'])
    expect(game.current.move?.san).toBe('e5')
  })

  it('reads games from a FEN header', () => {
    const { game } = importPgn(
      '[SetUp "1"]\n[FEN "7k/6pp/8/8/8/8/8/R5K1 w - - 0 40"]\n\n40. Ra8# 1-0',
    )
    expect(game.status().kind).toBe('checkmate')
  })

  it('round-trips', () => {
    const original = importPgn('1. e4 (1. d4 d5) e5 2. Nf3 Nc6 3. Bb5 a6 *').game
    const copy = importPgn(exportPgn(original)).game
    expect(exportPgn(copy)).toBe(exportPgn(original))
    expect(copy.fen()).toBe(original.fen())
  })

  it('fails on illegal moves and empty input', () => {
    expect(() => importPgn('1. e4 e5 2. Ke3 *')).toThrow(PgnImportError)
    expect(() => importPgn('')).toThrow(PgnImportError)
    expect(() => importPgn('garbage that is not chess')).toThrow(PgnImportError)
  })

  it('accepts a game with headers but no moves yet', () => {
    const { game, headers } = importPgn('[White "Alice"]\n[Black "Bob"]\n\n*')
    expect(headers.Black).toBe('Bob')
    expect(game.current).toBe(game.root)
  })
})
