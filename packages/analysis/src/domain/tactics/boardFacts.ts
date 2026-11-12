/**
 * What the theme detectors ask of a position, ported from `tagger/util.py` of lichess-puzzler
 * (https://github.com/ornicar/lichess-puzzler, AGPL-3.0); see `detectors.ts`.
 */
import type { BoardView, Color, Piece, Role, SquareName } from '@pawnia/chess'
import type { LineNode } from './puzzle'

/** Pawn units. The king's value only ranks it above everything else. */
export const VALUES: Record<Role, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 99,
}

const RAY_ROLES: readonly Role[] = ['queen', 'rook', 'bishop']

export function isRayPiece(role: Role): boolean {
  return RAY_ROLES.includes(role)
}

export function opposite(color: Color): Color {
  return color === 'white' ? 'black' : 'white'
}

/** A promotion, or a pawn arriving in the opponent's half beyond its fifth rank. */
export function isAdvancedPawnMove(node: LineNode, mover: Color): boolean {
  if (node.promotion) return true
  if (node.moved !== 'pawn') return false
  const rank = Number(node.to[1])
  return mover === 'white' ? rank >= 6 : rank <= 3
}

/** A promotion, or a pawn arriving on its seventh rank. */
export function isVeryAdvancedPawnMove(node: LineNode, mover: Color): boolean {
  if (!isAdvancedPawnMove(node, mover)) return false
  const rank = Number(node.to[1])
  return mover === 'white' ? rank >= 7 : rank <= 2
}

export function isCastling(node: LineNode): boolean {
  return node.moved === 'king' && Math.abs(node.from.charCodeAt(0) - node.to.charCodeAt(0)) > 1
}

/** `side`'s material minus the other side's, in pawns (kings aside). */
export function materialDiff(board: BoardView, side: Color): number {
  let diff = 0
  for (const { piece } of board.pieces()) {
    if (piece.role === 'king') continue
    diff += piece.color === side ? VALUES[piece.role] : -VALUES[piece.role]
  }
  return diff
}

/** The other side's pieces that the piece on `from` attacks. */
export function attackedOpponentSquares(
  board: BoardView,
  from: SquareName,
  pov: Color,
): { piece: Piece; square: SquareName }[] {
  const found: { piece: Piece; square: SquareName }[] = []
  for (const square of board.attacksFrom(from)) {
    const piece = board.pieceAt(square)
    if (piece && piece.color !== pov) found.push({ piece, square })
  }
  return found
}

/**
 * Defended by a piece of its own side, directly or from behind an attacking rook, bishop or
 * queen (which would be retaken once it captures).
 */
export function isDefended(board: BoardView, piece: Piece, square: SquareName): boolean {
  if (board.attackers(square, piece.color).length > 0) return true
  for (const attacker of board.attackers(square, opposite(piece.color))) {
    const role = board.pieceAt(attacker)?.role
    if (role && isRayPiece(role) && board.attackers(square, piece.color, attacker).length > 0) {
      return true
    }
  }
  return false
}

export function isHanging(board: BoardView, piece: Piece, square: SquareName): boolean {
  return !isDefended(board, piece, square)
}

function canBeTakenByLowerPiece(board: BoardView, piece: Piece, square: SquareName): boolean {
  return board.attackers(square, opposite(piece.color)).some((attacker) => {
    const role = board.pieceAt(attacker)?.role
    return role !== undefined && role !== 'king' && VALUES[role] < VALUES[piece.role]
  })
}

/** Attacked, and either undefended or attacked by something cheaper. */
export function isInBadSpot(board: BoardView, square: SquareName): boolean {
  const piece = board.pieceAt(square)
  if (!piece) return false
  return (
    board.attackers(square, opposite(piece.color)).length > 0 &&
    (isHanging(board, piece, square) || canBeTakenByLowerPiece(board, piece, square))
  )
}

/**
 * The piece (of the side to move) stands badly and has no move to a square where it doesn't,
 * nor a capture worth at least itself.
 */
export function isTrapped(board: BoardView, square: SquareName): boolean {
  if (board.isCheck() || board.pinLine(square)) return false
  const piece = board.pieceAt(square)
  if (!piece || piece.color !== board.turn) return false
  if (piece.role === 'pawn' || piece.role === 'king') return false
  if (!isInBadSpot(board, square)) return false
  for (const escape of board.legalMoves()) {
    if (escape.from !== square) continue
    const capturing = board.pieceAt(escape.to)
    if (capturing && VALUES[capturing.role] >= VALUES[piece.role]) return false
    const after = board.play(`${escape.from}${escape.to}`)
    if (after && !isInBadSpot(after, escape.to)) return false
  }
  return true
}
