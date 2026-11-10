import { importPgn, type GameStatus } from '@pawnia/chess'
import type { GameResult } from '@pawnia/library'

/** How a game ended. Decisive games and draws each have their own reasons; 'other' covers the rest. */
export type EndReason =
  | 'checkmate'
  | 'resignation'
  | 'time'
  | 'abandoned'
  | 'agreement'
  | 'repetition'
  | 'stalemate'
  | 'insufficient-material'
  | 'fifty-move-rule'
  | 'timeout-vs-insufficient'
  | 'other'

/** What a game's moves tell beyond its listing: its first moves, length and how it ended. */
export interface GameFacts {
  /** Half-moves in the main line. */
  plies: number
  /** The first OPENING_MOVES_KEPT half-moves in SAN, for the repertoire. */
  moves: string[]
  end: EndReason
}

/** Half-moves kept per game: enough for a repertoire a few moves deep. */
export const OPENING_MOVES_KEPT = 8

/** The facts of a game from its PGN; undefined when the PGN can't be read. */
export function gameFacts(pgn: string, result: GameResult): GameFacts | undefined {
  let imported
  try {
    imported = importPgn(pgn)
  } catch {
    return undefined
  }
  const line = imported.game.line()
  return {
    plies: line.length,
    moves: line.slice(0, OPENING_MOVES_KEPT).flatMap((node) => (node.move ? [node.move.san] : [])),
    // The cursor ends on the last main-line move, so the status is the final position's.
    end: endReason(imported.headers['Termination'], imported.game.status(), result),
  }
}

/**
 * Why a game ended, from the Termination tag and the final position. chess.com names the reason
 * ("Hikaru won by resignation", "Game drawn by repetition"); lichess says "Normal" for mate,
 * resignation and agreed draws alike, so then the board tells.
 */
export function endReason(
  termination: string | undefined,
  status: GameStatus,
  result: GameResult,
): EndReason {
  if (status.kind === 'checkmate') return 'checkmate'
  const tag = termination?.trim().toLowerCase() ?? ''
  const draw = result === '1/2-1/2'
  if (tag.includes('checkmate')) return 'checkmate'
  if (tag.includes('resign')) return 'resignation'
  if (tag.includes('abandon')) return 'abandoned'
  if (tag.includes('time')) return draw ? 'timeout-vs-insufficient' : 'time'
  if (tag.includes('agree')) return 'agreement'
  if (tag.includes('repetition')) return 'repetition'
  if (tag.includes('stalemate')) return 'stalemate'
  if (tag.includes('insufficient')) return 'insufficient-material'
  if (tag.includes('50') || tag.includes('fifty')) return 'fifty-move-rule'
  if (tag !== 'normal') return 'other'
  if (status.kind === 'draw') {
    switch (status.reason) {
      case 'stalemate':
        return 'stalemate'
      case 'insufficient-material':
        return 'insufficient-material'
      case 'threefold-repetition':
        return 'repetition'
      case 'fifty-move-rule':
        return 'fifty-move-rule'
    }
  }
  if (draw) return 'agreement'
  return result === '*' ? 'other' : 'resignation'
}
