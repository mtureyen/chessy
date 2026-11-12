import { engineLineThemes, type GameReview, type ReviewedMove, type Theme } from '@pawnia/analysis'
import type { PlayerGame } from './playerGames'
import { MISTAKES } from './training'

/** The tactics around one mistake of the user's. */
export interface MistakeThemes {
  ply: number
  /** The move as written in a game, e.g. "12... Qxb7". */
  played: string
  verdict: ReviewedMove['classification']
  /** What the user could have played and didn't: the themes of the engine's better line. */
  missed: Theme[]
  /** What the move allowed: the themes of the opponent's best line after it. */
  walkedInto: Theme[]
}

/**
 * The themes of the user's mistakes in one reviewed game, in game order. Every mistake is
 * listed; most have no theme, because the line wins nothing tangible (see `cutEngineLine`) or
 * what it wins has no name among the themes.
 *
 * Both lines are read as lichess reads a puzzle, the move before as the one that sets it up:
 *  - missed: the opponent's last move, then the engine's line from the position the user was in;
 *  - walked into: the user's move, then the engine's line for the opponent, which the review
 *    keeps as the next move's `best`.
 * A mistake on the first move has no move before it and so nothing missed; one on the last move
 * of the game has no reply to walk into.
 */
export function mistakeThemes(game: PlayerGame, review: GameReview): MistakeThemes[] {
  return review.moves.flatMap((move) => {
    if (move.color !== game.side || !MISTAKES.includes(move.classification)) return []
    const before = review.positions[move.ply - 1]?.fen
    if (!before) return []

    const setup = review.moves[move.ply - 2]
    const setupFen = review.positions[move.ply - 2]?.fen
    const missed =
      setup && setupFen && move.best
        ? engineLineThemes({ fen: setupFen, moves: [setup.uci, ...move.best.line] })
        : []

    const reply = review.moves[move.ply]
    const walkedInto = reply?.best
      ? engineLineThemes({ fen: before, moves: [move.uci, ...reply.best.line] })
      : []

    return [
      {
        ply: move.ply,
        played: `${move.moveNumber}${move.color === 'white' ? '.' : '...'} ${move.san}`,
        verdict: move.classification,
        missed,
        walkedInto,
      },
    ]
  })
}

/** Where a theme showed up: a mistake in one of the user's games. */
export interface ThemeExample {
  gameId: string
  ply: number
}

/** How often a theme was behind the user's mistakes; the counts are the lengths of the lists. */
export interface ThemeTally {
  theme: Theme
  missed: ThemeExample[]
  walkedInto: ThemeExample[]
}

/**
 * The themes of the user's mistakes across games, the most frequent first (missed and walked
 * into together). Examples keep the order of the games given, so recent games first in, recent
 * examples first out.
 */
export function tallyThemes(
  games: readonly { gameId: string; mistakes: readonly MistakeThemes[] }[],
): ThemeTally[] {
  const tallies = new Map<Theme, ThemeTally>()
  const tallyOf = (theme: Theme) => {
    let tally = tallies.get(theme)
    if (!tally) tallies.set(theme, (tally = { theme, missed: [], walkedInto: [] }))
    return tally
  }
  for (const { gameId, mistakes } of games) {
    for (const mistake of mistakes) {
      for (const theme of mistake.missed) tallyOf(theme).missed.push({ gameId, ply: mistake.ply })
      for (const theme of mistake.walkedInto) {
        tallyOf(theme).walkedInto.push({ gameId, ply: mistake.ply })
      }
    }
  }
  const total = (tally: ThemeTally) => tally.missed.length + tally.walkedInto.length
  // The sort is stable: themes with equal counts stay in the order they first came up.
  return [...tallies.values()].sort((a, b) => total(b) - total(a))
}
