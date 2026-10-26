import { Chess } from 'chessops/chess'
import { perft } from 'chessops/debug'
import { parseFen } from 'chessops/fen'
import { describe, expect, it } from 'vitest'
import { createGame, type GameState } from './game'

// Known node counts: https://www.chessprogramming.org/Perft_Results
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'
const POSITION_5 = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8'

describe('perft: chessops itself', () => {
  it('start position', () => {
    const pos = Chess.default()
    expect([1, 2, 3, 4].map((d) => perft(pos, d))).toEqual([20, 400, 8902, 197281])
  })

  it('kiwipete (castling, en passant, promotion edge cases)', () => {
    const pos = Chess.fromSetup(parseFen(KIWIPETE).unwrap()).unwrap()
    expect([1, 2, 3].map((d) => perft(pos, d))).toEqual([48, 2039, 97862])
  })
})

/** Counts leaf nodes using only the public GameState API (legalMoves → play → back). */
function gamePerft(game: GameState, depth: number): number {
  if (depth === 0) return 1
  let nodes = 0
  for (const move of game.legalMoves()) {
    if (!game.play(move))
      throw new Error(`legalMoves() listed an unplayable move: ${JSON.stringify(move)}`)
    nodes += gamePerft(game, depth - 1)
    game.back()
  }
  return nodes
}

describe('perft: through our GameState', () => {
  it('start position', () => {
    expect(gamePerft(createGame(START), 3)).toBe(8902)
  })

  it('kiwipete', () => {
    expect(gamePerft(createGame(KIWIPETE), 2)).toBe(2039)
  })

  it('position 5 (promotions with capture, castling)', () => {
    expect(gamePerft(createGame(POSITION_5), 2)).toBe(1486)
  })
})
