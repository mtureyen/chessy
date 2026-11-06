import { keyMoments, type GameReview, type ReviewInput } from '@chessy/analysis'
import { mostExposedPiece, type MoveNode } from '@chessy/chess'
import type { CoachCommentBody } from '@chessy/contracts'

/**
 * What a review has to see to judge a move as it would in the whole game: the move and the
 * opponent's move before it (a "great" punishes that move, a "miss" lets it go).
 */
export function judgedMoves(node: MoveNode): Pick<ReviewInput, 'startFen' | 'moves'> {
  const previous = node.parent
  const earlier = previous?.parent
  if (!previous?.move || !earlier) return { startFen: previous?.fen ?? node.fen, moves: uci(node) }
  return { startFen: earlier.fen, moves: [...uci(previous), ...uci(node)] }
}

function uci(node: MoveNode): string[] {
  return node.move ? [node.move.uci] : []
}

/**
 * The facts for a comment on `node`, the last move of `review`, if it is one of the moves a
 * review points out. Built field by field: of what the review knows, the engine's preferred move
 * and line must never reach a comment during a game.
 */
export function commentFacts(
  node: MoveNode,
  review: GameReview,
  rating: number | undefined,
): CoachCommentBody | undefined {
  const judged = review.moves.at(-1)
  const score = review.positions.at(-1)?.score
  if (!node.move || !judged || !score || !keyMoments(review).includes(judged)) return undefined
  const { color, moveNumber, san } = node.move
  const exposed = mostExposedPiece(node.fen, color)
  const mated = score.type === 'mate' && score.winner !== color && score.moves > 0
  return {
    fen: node.fen,
    color,
    moveNumber,
    san,
    // keyMoments only lets these classes through.
    verdict: judged.classification as CoachCommentBody['verdict'],
    winBefore: judged.winBefore,
    winAfter: judged.winAfter,
    ...(exposed && {
      hanging: { piece: exposed.role, square: exposed.square, pawns: exposed.gain },
    }),
    ...(mated && { mateIn: score.moves }),
    ...(rating && { rating }),
  }
}
