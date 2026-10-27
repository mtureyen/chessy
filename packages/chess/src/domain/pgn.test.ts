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

describe('PGN comments and clocks', () => {
  const PGN = [
    '[White "A"]',
    '[Black "B"]',
    '',
    '{ Blitz game } 1. e4 { [%clk 0:02:59.1] } 1... e5 { Solid. [%clk 0:02:58] [%eval 0.2] }',
    '2. Nf3 { [%clk 1:00:05] } *',
  ].join('\n')

  it('reads clock times in seconds and comment text without commands', () => {
    const { game } = importPgn(PGN)
    const [e4, e5, nf3] = game.line()
    expect(game.root.comments).toEqual(['Blitz game'])
    expect(e4).toMatchObject({ clock: 179.1, comments: [] })
    expect(e5).toMatchObject({ clock: 178, comments: ['Solid.'] })
    expect(nf3?.clock).toBe(3605)
  })

  it('writes them back on export and survives a round trip', () => {
    const { game } = importPgn(PGN)
    const pgn = exportPgn(game)
    expect(pgn).toContain('{ Blitz game }')
    expect(pgn).toContain('e4 { [%clk 0:02:59.1] }')
    expect(pgn).toContain('e5 { Solid. [%clk 0:02:58] }')
    const again = importPgn(pgn).game
    expect(again.line().map((n) => [n.clock, n.comments])).toEqual(
      game.line().map((n) => [n.clock, n.comments]),
    )
  })

  it('leaves moves without annotations untouched', () => {
    const { game } = importPgn('1. e4 e5 *')
    expect(game.line().map((n) => [n.clock, n.comments.length])).toEqual([
      [undefined, 0],
      [undefined, 0],
    ])
    expect(exportPgn(game)).toContain('1. e4 e5 *')
  })
})

describe('annotate', () => {
  it('sets only the given fields', () => {
    const game = createGame()
    const node = game.play('e4')!
    game.annotate(node, { comments: ['Best by test'] })
    game.annotate(node, { clock: 60 })
    expect(node).toMatchObject({ comments: ['Best by test'], clock: 60 })
    game.annotate(node, { clock: undefined })
    expect(node.clock).toBeUndefined()
  })
})
