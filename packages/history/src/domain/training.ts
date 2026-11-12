import { formatSanLine, toSanLine, type GameReview, type ReviewedMove } from '@pawnia/analysis'
import type { Color } from '@pawnia/chess'
import type { GameLine } from './line'
import type { PlayerGame } from './playerGames'

/** The classes of move that count as a mistake of the user's. */
export const MISTAKES: readonly ReviewedMove['classification'][] = ['mistake', 'miss', 'blunder']
/** Winning chances (%) the best move must be ahead of the next one: a puzzle has one answer. */
const CLEAR_BEST_GAP = 10
/** Moves of the answer's line shown once it is solved. */
const LINE_MOVES = 6
/** Days until a puzzle comes back after each miss, the last one again and again. */
const REPEAT_DAYS = [1, 3, 7]

/** A mistake of the user's, with one clearly better move to find. */
export interface Puzzle {
  /** The game's main line and the mistake's ply: what identifies the puzzle. */
  line: GameLine
  ply: number
  /** The position to solve. */
  fen: string
  color: Color
  /** The move as written in a game, e.g. "12... Qxb7". */
  played: string
  verdict: ReviewedMove['classification']
  best: { move: string; uci: string; line: string }
  game: { id: string; opponent: string; date: string; opening?: string }
}

/** The moves of a review worth training: the user's mistakes with one clearly best answer. */
function isPuzzle(move: ReviewedMove, side: Color): boolean {
  const { winBefore, secondBestWin } = move.facts
  return (
    move.color === side &&
    MISTAKES.includes(move.classification) &&
    move.best !== undefined &&
    move.best.uci !== move.uci &&
    secondBestWin !== undefined &&
    winBefore - secondBestWin >= CLEAR_BEST_GAP
  )
}

/** The puzzles in one reviewed game of the user's. */
export function gamePuzzles(game: PlayerGame, line: GameLine, review: GameReview): Puzzle[] {
  return review.moves.flatMap((move) => {
    const fen = review.positions[move.ply - 1]?.fen
    if (!fen || !isPuzzle(move, game.side)) return []
    const best = move.best!
    return [
      {
        line,
        ply: move.ply,
        fen,
        color: move.color,
        played: `${move.moveNumber}${move.color === 'white' ? '.' : '...'} ${move.san}`,
        verdict: move.classification,
        best: {
          move: best.san,
          uci: best.uci,
          line: formatSanLine(toSanLine(fen, best.line, LINE_MOVES)),
        },
        game: {
          id: game.game.id,
          opponent: game.opponent.name,
          date: game.game.playedAt.slice(0, 10),
          ...(game.game.opening?.name && { opening: game.game.opening.name }),
        },
      },
    ]
  })
}

/** How far the user is with a puzzle. A puzzle without progress is new, and due. */
export interface PuzzleProgress {
  /** How many times it was missed so far. */
  misses: number
  /** ISO timestamp; absent once it was solved at the first try. */
  dueAt?: string
}

/**
 * The progress after an attempt: solved at the first try it is done; missed, it comes back after
 * 1, 3 and then every 7 days.
 */
export function afterAttempt(
  progress: PuzzleProgress | undefined,
  solvedFirstTry: boolean,
  now: Date,
): PuzzleProgress {
  const misses = progress?.misses ?? 0
  if (solvedFirstTry) return { misses }
  const days = REPEAT_DAYS[Math.min(misses, REPEAT_DAYS.length - 1)]!
  return {
    misses: misses + 1,
    dueAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
  }
}

export type PuzzleState = 'due' | 'waiting' | 'solved'

export function puzzleState(progress: PuzzleProgress | undefined, now: Date): PuzzleState {
  if (!progress) return 'due'
  if (progress.dueAt === undefined) return 'solved'
  return new Date(progress.dueAt) <= now ? 'due' : 'waiting'
}
