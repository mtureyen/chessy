import type { Color } from '@chessy/chess'

/**
 * An engine evaluation, always from White's point of view.
 * Mate is kept separate from centipawns so it never gets mixed into averages or deltas.
 */
export type Score = { type: 'cp'; value: number } | { type: 'mate'; winner: Color; moves: number }

/** Raw UCI score, relative to the side to move. `mate 0` means the side to move is mated. */
export interface RelativeScore {
  type: 'cp' | 'mate'
  value: number
}

export function toWhitePov(score: RelativeScore, sideToMove: Color): Score {
  const sign = sideToMove === 'white' ? 1 : -1
  if (score.type === 'cp') return { type: 'cp', value: score.value * sign }
  // `mate 0` and negative values: the side to move gets mated.
  const sideToMoveWins = score.value > 0
  const winner: Color = sideToMoveWins === (sideToMove === 'white') ? 'white' : 'black'
  return { type: 'mate', winner, moves: Math.abs(score.value) }
}

/** lichess' winning-chances curve: centipawns → [-1, +1]. https://lichess.org/page/accuracy */
export function winningChances(cp: number): number {
  return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1
}

/**
 * Winning chance for White in percent (0–100), for display (eval bar): mates are 100 / 0,
 * centipawns are not capped. Reviews use `winPercent` instead.
 */
export function whiteWinChance(score: Score): number {
  if (score.type === 'mate') return score.winner === 'white' ? 100 : 0
  return 50 + 50 * winningChances(score.value)
}

/** Human-readable score: `+0.35`, `-1.20`, `#3` (White mates), `#-2` (Black mates). */
export function formatScore(score: Score): string {
  if (score.type === 'mate') return `#${score.winner === 'white' ? '' : '-'}${score.moves}`
  const pawns = score.value / 100
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`
}

/** Orders scores from White's perspective (positive: `a` is better for White). */
export function compareScores(a: Score, b: Score): number {
  return rank(a) - rank(b)
}

// Mates outrank any centipawn value; a faster mate is better for the winner.
function rank(score: Score): number {
  if (score.type === 'cp') return score.value
  const magnitude = 1_000_000 - score.moves
  return score.winner === 'white' ? magnitude : -magnitude
}
