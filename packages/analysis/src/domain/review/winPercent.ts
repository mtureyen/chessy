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

/** The score in centipawns from `pov`'s side, capped at ±`ceiling`; a mate counts as the cap. */
export function povCentipawns(score: Score, pov: Color, ceiling: number): number {
  const white =
    score.type === 'mate'
      ? score.winner === 'white'
        ? ceiling
        : -ceiling
      : Math.max(-ceiling, Math.min(ceiling, score.value))
  return pov === 'white' ? white : -white
}
