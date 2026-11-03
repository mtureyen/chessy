import { attacks } from 'chessops/attacks'
import type { Board } from 'chessops/board'
import { parseFen } from 'chessops/fen'
import type { SquareSet } from 'chessops/squareSet'
import type { Role, Square } from 'chessops/types'
import { makeSquare, parseSquare } from 'chessops/util'
import type { Color, SquareName } from './types'

/** Pawn units; the king's value only orders it last among attackers. */
const VALUES: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 }
const BY_VALUE: readonly Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']

/**
 * What `by` wins, in pawns, by capturing on `square` (static exchange evaluation): the
 * captures on that square are played out, each side using its cheapest attacker and stopping
 * when going on would cost it. Pieces behind others (batteries) join as the square clears.
 * 0 if `by` cannot capture there or capturing loses material. Pins and checks are ignored.
 */
export function staticExchange(fen: string, square: SquareName, by: Color): number {
  const setup = parseFen(fen)
  if (setup.isErr) throw new Error(`Invalid FEN: ${fen}`)
  const { board } = setup.value
  const target = parseSquare(square)
  const victim = board.get(target)
  if (!victim || victim.color === by) return 0

  let occupied = board.occupied
  let side = by
  let onSquare = VALUES[victim.role]
  const gains: number[] = []
  for (;;) {
    const attacker = cheapestAttacker(board, target, side, occupied)
    if (!attacker) break
    const rest = occupied.without(attacker.square)
    // A king may only take when nothing can take it back.
    if (attacker.role === 'king' && cheapestAttacker(board, target, opposite(side), rest)) break
    gains.push(onSquare - (gains.at(-1) ?? 0))
    onSquare = VALUES[attacker.role]
    occupied = rest
    side = opposite(side)
  }
  // Each side may stop instead of capturing: fold the sequence back from its end.
  for (let i = gains.length - 1; i > 0; i--) gains[i - 1] = -Math.max(-gains[i - 1]!, gains[i]!)
  return Math.max(0, gains[0] ?? 0)
}

/**
 * The most material the opponent of `color` could win by capturing one of `color`'s pieces
 * (knights and up; pawns and the king aside), with the square of that piece. Undefined if no
 * such capture wins anything.
 */
export function mostExposedPiece(
  fen: string,
  color: Color,
): { square: SquareName; gain: number } | undefined {
  const setup = parseFen(fen)
  if (setup.isErr) throw new Error(`Invalid FEN: ${fen}`)
  let best: { square: SquareName; gain: number } | undefined
  for (const [square, piece] of setup.value.board) {
    if (piece.color !== color || piece.role === 'pawn' || piece.role === 'king') continue
    const name = makeSquare(square)
    const gain = staticExchange(fen, name, opposite(color))
    if (gain > 0 && gain > (best?.gain ?? 0)) best = { square: name, gain }
  }
  return best
}

function cheapestAttacker(board: Board, target: Square, color: Color, occupied: SquareSet) {
  for (const role of BY_VALUE) {
    for (const square of board.pieces(color, role).intersect(occupied)) {
      if (attacks({ role, color }, square, occupied).has(target)) return { square, role }
    }
  }
  return undefined
}

function opposite(color: Color): Color {
  return color === 'white' ? 'black' : 'white'
}
