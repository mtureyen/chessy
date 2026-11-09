import type { GameReview, ReviewedMove } from '@pawnia/analysis'
import type { Move, SquareName } from '@pawnia/chess'
import type { CoachWalkthroughBody } from '@pawnia/contracts'
import type { PlacedDrawing } from '@/features/coach/useCoachChat'

/** One stop of a walkthrough, in the order the user goes through them. */
export type WalkthroughStep =
  | { kind: 'summary' }
  | { kind: 'opening'; opening: NonNullable<CoachWalkthroughBody['opening']> }
  | { kind: 'moment'; moment: CoachWalkthroughBody['moments'][number]; move: ReviewedMove }
  | { kind: 'focus' }

/** How the game went first, then the opening, the moments in game order, what to work on last. */
export function walkthroughSteps(
  walkthrough: CoachWalkthroughBody,
  review: GameReview,
): WalkthroughStep[] {
  const moments = walkthrough.moments.flatMap((moment): WalkthroughStep[] => {
    const move = review.moves.find((m) => m.ply === moment.ply)
    return move ? [{ kind: 'moment', moment, move }] : []
  })
  const { opening } = walkthrough
  return [
    { kind: 'summary' },
    ...(opening ? [{ kind: 'opening' as const, opening }] : []),
    ...moments,
    { kind: 'focus' },
  ]
}

const ERRORS: readonly ReviewedMove['classification'][] = ['mistake', 'miss', 'blunder']

/** A move that went wrong, so there is a better one to look for. */
export function wentWrong(move: ReviewedMove): boolean {
  return ERRORS.includes(move.classification)
}

/**
 * The board while the user looks for a better move: moves go to `onMove` and not into the game.
 * `shown` is the try on display, until they go on.
 */
export interface BoardTry {
  fen: string
  onMove: (move: Move) => void
  shown?: { fen: string; lastMove: [SquareName, SquareName] }
}

/**
 * What the board shows at a moment: the position before the move, the move played (red if it
 * went wrong) and, once revealed, the better one. It comes from the review, not from the coach.
 */
export function momentDrawing(
  move: ReviewedMove,
  review: GameReview,
  revealed: boolean,
): PlacedDrawing | undefined {
  const fen = review.positions[move.ply - 1]?.fen
  if (!fen) return undefined
  const arrow = (uci: string, color: 'green' | 'red') => ({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    color,
  })
  const better = revealed && move.best && move.best.uci !== move.uci ? move.best : undefined
  return {
    fen,
    arrows: [
      arrow(move.uci, wentWrong(move) ? 'red' : 'green'),
      ...(better ? [arrow(better.uci, 'green')] : []),
    ],
    squares: [],
  }
}
