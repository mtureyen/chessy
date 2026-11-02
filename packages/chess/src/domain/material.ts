import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import type { Role } from 'chessops/types'
import type { Color } from './types'

const VALUES: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 }

/** Material balance in pawns from White's point of view (P=1, N=B=3, R=5, Q=9). */
export function materialBalance(fen: string): number {
  const setup = parseFen(fen)
  if (setup.isErr) throw new Error(`Invalid FEN: ${fen}`)
  let balance = 0
  for (const [, piece] of setup.value.board) {
    balance += piece.color === 'white' ? VALUES[piece.role] : -VALUES[piece.role]
  }
  return balance
}

/**
 * True if `color` has too little material to ever checkmate, whatever the opponent does
 * (e.g. a lone king, or king and knight). A player who runs out of time against such a side
 * gets a draw instead of a loss.
 */
export function hasInsufficientMaterial(fen: string, color: Color): boolean {
  const setup = parseFen(fen)
  if (setup.isErr) throw new Error(`Invalid FEN: ${fen}`)
  const position = Chess.fromSetup(setup.value)
  if (position.isErr) throw new Error(`Invalid position: ${fen}`)
  return position.value.hasInsufficientMaterial(color)
}
