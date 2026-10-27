import type { Color } from '@chessy/chess'
import { winningChances, type Score } from '../score'

/** lichess caps evaluations at ±10 pawns; a mate counts as exactly that (scalachess `Cp.CEILING`). */
export const CP_CEILING = 1000

/** The score as centipawns from White's view, capped the way lichess does for accuracy. */
export function cappedCentipawns(score: Score): number {
  if (score.type === 'mate') return score.winner === 'white' ? CP_CEILING : -CP_CEILING
  return Math.max(-CP_CEILING, Math.min(CP_CEILING, score.value))
}

/** Winning chance in percent for `pov`, exactly as lichess computes it for accuracy. */
export function winPercent(score: Score, pov: Color): number {
  const white = 50 + 50 * winningChances(cappedCentipawns(score))
  return pov === 'white' ? white : 100 - white
}
