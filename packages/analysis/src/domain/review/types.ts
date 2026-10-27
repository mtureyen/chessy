import type { Color } from '@chessy/chess'
import type { EngineLine } from '../analysis'
import type { Score } from '../score'
import type { MoveClass } from './classify'

export interface PositionEval {
  /** Best lines (multi-PV), empty for positions without legal moves. */
  lines: EngineLine[]
  depth: number
}

export interface ReviewedPosition {
  fen: string
  score: Score
  /** White's winning chance (lichess curve, capped), for the eval graph. */
  whiteWin: number
}

export interface ReviewedMove {
  /** 1-based half-move number in the game. */
  ply: number
  moveNumber: number
  color: Color
  san: string
  uci: string
  /** Mover's winning chances before and after (lichess curve, capped). */
  winBefore: number
  winAfter: number
  /** Move accuracy (0–100), lichess formula. */
  accuracy: number
  classification: MoveClass
  /** The engine's preferred move and line in the position before. */
  best?: { uci: string; san: string; line: string[] }
}

export interface GameReview {
  startFen: string
  /** positions[0] is the start, positions[i] the position after moves[i-1]. */
  positions: ReviewedPosition[]
  moves: ReviewedMove[]
  accuracy: Partial<Record<Color, number>>
  counts: Record<Color, Partial<Record<MoveClass, number>>>
  settings: { engine: string; nodes: number }
}

const NOTABLE: readonly MoveClass[] = ['brilliant', 'great', 'miss', 'mistake', 'blunder']

/** The moves worth looking at again: brilliant/great finds and the big errors, in game order. */
export function keyMoments(review: GameReview): ReviewedMove[] {
  return review.moves.filter((m) => NOTABLE.includes(m.classification))
}
