import {
  formatSanLine,
  keyMoments,
  toSanLine,
  type GameReview,
  type ReviewedMove,
} from '@chessy/analysis'
import { mostExposedPiece, type Color } from '@chessy/chess'
import { phaseOf, type GamePhase } from './stats'

/** A walkthrough stops at this many moments; beyond it they tire more than they teach. */
export const MAX_MOMENTS = 8
/** Moves of an engine line shown for a moment. */
const LINE_MOVES = 6
/** Moves of the game shown after a moment. */
const PLAYED_MOVES = 4

/** A key moment as the coach explains it: what the review knows of it, in plain values. */
export interface MomentFacts {
  ply: number
  /** The move as written in a game, e.g. "12... Qxb7". */
  move: string
  color: Color
  verdict: ReviewedMove['classification']
  /** The mover's winning chances (%) before and after it. */
  winBefore: number
  winAfter: number
  /** The engine's better move and its line, in SAN. */
  better?: { move: string; line: string }
  /** What really followed in the game, in SAN; absent when the game ended with this move. */
  played?: string
  /** The engine's best answer to the move: what could have followed, not what did. */
  bestReply?: string
  /** A piece of the mover's the opponent can now win, and what that gains (pawns). */
  hanging?: { piece: string; square: string; pawns: number }
  /** How likely a player of the mover's rating was to play it (%), if known. */
  playedBy?: number
}

/**
 * The moments a walkthrough stops at, in game order: the key moments of `side` (of both when
 * undefined). When there are too many, brilliant and great moves stay, then the biggest swings.
 */
export function walkthroughMoves(
  review: GameReview,
  side: Color | undefined,
  max = MAX_MOMENTS,
): ReviewedMove[] {
  const moments = keyMoments(review).filter((move) => !side || move.color === side)
  const weight = (move: ReviewedMove) =>
    move.classification === 'brilliant' || move.classification === 'great'
      ? Infinity
      : Math.abs(move.winBefore - move.winAfter)
  return [...moments]
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, max)
    .sort((a, b) => a.ply - b.ply)
}

export function momentFacts(review: GameReview, move: ReviewedMove): MomentFacts {
  const before = review.positions[move.ply - 1]?.fen
  const after = review.positions[move.ply]?.fen
  const next = review.moves.find((m) => m.ply === move.ply + 1)
  const line = (fen: string | undefined, pv: readonly string[] | undefined) =>
    fen && pv ? formatSanLine(toSanLine(fen, pv, LINE_MOVES)) : ''
  const better = move.best && move.best.uci !== move.uci ? move.best : undefined
  const bestReply = line(after, next?.best?.line)
  const played = review.moves
    .slice(move.ply, move.ply + PLAYED_MOVES)
    .map((m) => `${m.moveNumber}${m.color === 'white' ? '.' : '...'} ${m.san}`)
    .join(' ')
  const exposed = after ? mostExposedPiece(after, move.color) : undefined
  const playedBy = move.facts.humanProbability
  return {
    ply: move.ply,
    move: `${move.moveNumber}${move.color === 'white' ? '.' : '...'} ${move.san}`,
    color: move.color,
    verdict: move.classification,
    winBefore: Math.round(move.winBefore),
    winAfter: Math.round(move.winAfter),
    ...(better && { better: { move: better.san, line: line(before, better.line) } }),
    ...(played && { played }),
    ...(bestReply && { bestReply }),
    ...(exposed && {
      hanging: { piece: exposed.role, square: exposed.square, pawns: exposed.gain },
    }),
    ...(playedBy !== undefined && { playedBy: Math.round(playedBy * 100) }),
  }
}

/** The move that left the opening book, as far as the review tells: the last book move's ply. */
export function lastBookPly(review: GameReview): number | undefined {
  return review.moves.findLast((move) => move.classification === 'book')?.ply
}

/** How accurately `color` played in each phase of the game (mean move accuracy), where it did. */
export function phaseAccuracy(
  review: GameReview,
  color: Color,
): Partial<Record<GamePhase, number>> {
  const sums = new Map<GamePhase, { total: number; moves: number }>()
  for (const move of review.moves) {
    if (move.color !== color) continue
    const fen = review.positions[move.ply - 1]?.fen
    const phase = phaseOf(move.ply, fen === undefined ? undefined : piecesOn(fen))
    const sum = sums.get(phase) ?? { total: 0, moves: 0 }
    sums.set(phase, { total: sum.total + move.accuracy, moves: sum.moves + 1 })
  }
  return Object.fromEntries(
    [...sums].map(([phase, { total, moves }]) => [phase, Math.round(total / moves)]),
  )
}

/** Queens, rooks, bishops and knights on the board. */
function piecesOn(fen: string): number {
  return fen.split(' ')[0]!.replace(/[^qrbnQRBN]/g, '').length
}

export type TryVerdict = 'right' | 'close' | 'wrong'

/** What a try at a better move comes to, by the class the review gives it. */
export function tryVerdict(classification: ReviewedMove['classification']): TryVerdict {
  if (classification === 'good') return 'close'
  return ['brilliant', 'great', 'best', 'excellent', 'book'].includes(classification)
    ? 'right'
    : 'wrong'
}
