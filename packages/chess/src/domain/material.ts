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

/** The piece types that can be taken, in the order they are listed next to a player. */
export const TAKEN_ROLES = ['pawn', 'knight', 'bishop', 'rook', 'queen'] as const

export type TakenRole = (typeof TAKEN_ROLES)[number]

type Pieces = Record<TakenRole, number>

/** What a side starts a game with. */
const FULL_SET: Pieces = { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1 }

export interface SideMaterial {
  /** How many pieces of each type to list next to this side (see `Material.kind`). */
  pieces: Pieces
  /** How many pawns' worth of material this side is ahead; 0 when it is level or behind. */
  lead: number
}

export interface Material {
  /**
   * What the lists mean. `taken`: the pieces each side has taken from the other. `extra`: the
   * first position can't come from two full sets (set up with nine pawns, or three queens and
   * all eight pawns), so nothing can be said about captures, and each side lists what it has
   * more of than the other.
   */
  kind: 'taken' | 'extra'
  white: SideMaterial
  black: SideMaterial
}

/**
 * The pieces each side has taken and who is ahead in the last of `positions`: the FENs from the
 * start of what is shown (a game, a position that was set up) to the position on the board, one
 * per move.
 *
 * The first position is measured against full sets: what is missing there was taken before, and
 * a piece beyond the full set was a pawn. After that the captures are read off the moves, so a
 * pawn that promotes is not listed and a promoted piece that is taken is.
 */
export function materialOf(positions: readonly string[]): Material {
  const boards = positions.map(countPieces)
  const first = boards[0]
  const last = boards.at(-1)
  if (!first || !last) throw new Error('No position')
  const lead = { white: Math.max(0, last.balance), black: Math.max(0, -last.balance) }

  const lost = { white: missingFrom(first.white), black: missingFrom(first.black) }
  if (!lost.white || !lost.black) {
    const white = noPieces()
    const black = noPieces()
    for (const role of TAKEN_ROLES) {
      const more = last.white[role] - last.black[role]
      white[role] = Math.max(0, more)
      black[role] = Math.max(0, -more)
    }
    return {
      kind: 'extra',
      white: { pieces: white, lead: lead.white },
      black: { pieces: black, lead: lead.black },
    }
  }

  boards.slice(1).forEach((board, i) => {
    // Only the side that did not move can have lost a piece; the mover's pawn may have promoted.
    const before = boards[i]!
    const victim = before.turn === 'white' ? 'black' : 'white'
    for (const role of TAKEN_ROLES) {
      lost[victim]![role] += Math.max(0, before[victim][role] - board[victim][role])
    }
  })
  return {
    kind: 'taken',
    white: { pieces: lost.black, lead: lead.white },
    black: { pieces: lost.white, lead: lead.black },
  }
}

function countPieces(fen: string): { white: Pieces; black: Pieces; turn: Color; balance: number } {
  const setup = parseFen(fen)
  if (setup.isErr) throw new Error(`Invalid FEN: ${fen}`)
  const counts = { white: noPieces(), black: noPieces(), turn: setup.value.turn, balance: 0 }
  for (const [, piece] of setup.value.board) {
    counts.balance += piece.color === 'white' ? VALUES[piece.role] : -VALUES[piece.role]
    if (piece.role !== 'king') counts[piece.color][piece.role] += 1
  }
  return counts
}

function noPieces(): Pieces {
  return { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 }
}

/** What a side has lost from a full set, or undefined when it has more than a full set allows. */
function missingFrom(counts: Pieces): Pieces | undefined {
  const missing = noPieces()
  let promoted = 0
  for (const role of TAKEN_ROLES) {
    if (role === 'pawn') continue
    missing[role] = Math.max(0, FULL_SET[role] - counts[role])
    promoted += Math.max(0, counts[role] - FULL_SET[role])
  }
  missing.pawn = FULL_SET.pawn - counts.pawn - promoted
  return missing.pawn < 0 ? undefined : missing
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
