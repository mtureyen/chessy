import type { SquareName } from 'chessops/types'

export type { SquareName }

export type Color = 'white' | 'black'

export type PromotionRole = 'queen' | 'rook' | 'bishop' | 'knight'

export const PROMOTION_ROLES: readonly PromotionRole[] = ['queen', 'rook', 'bishop', 'knight']

/** A move in standard UCI coordinates. Castling is written as the king's move, e.g. e1g1. */
export interface Move {
  from: SquareName
  to: SquareName
  promotion?: PromotionRole
}

export interface PlayedMove extends Move {
  uci: string
  san: string
  /** The side that made the move. */
  color: Color
  /** Fullmove number as printed in PGN ("12." / "12..."). */
  moveNumber: number
}

export type DrawReason =
  'stalemate' | 'insufficient-material' | 'threefold-repetition' | 'fifty-move-rule'

export type GameStatus =
  { kind: 'ongoing' } | { kind: 'checkmate'; winner: Color } | { kind: 'draw'; reason: DrawReason }

/**
 * A position in the move tree. The root holds the starting position and has no move.
 * `children[0]` is the main continuation, further children are variations.
 */
export interface MoveNode {
  readonly id: string
  readonly parent: MoveNode | undefined
  readonly children: readonly MoveNode[]
  /** Half-moves since the starting position (root = 0). */
  readonly ply: number
  readonly fen: string
  readonly move: PlayedMove | undefined
  /** Comment text (PGN `{ … }`) without embedded commands like `[%clk …]`. On the root: game comments. */
  readonly comments: readonly string[]
  /** Remaining clock of the side that just moved, in seconds (PGN `[%clk …]`). */
  readonly clock: number | undefined
}

export interface NodeAnnotations {
  comments?: string[]
  clock?: number | undefined
}
