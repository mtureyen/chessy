import type { Color } from '@chessy/chess'

/** When an engine match stops early, like cutechess' resign and draw adjudication. */
export const ADJUDICATION = {
  /** A side's winning chance (percent) that counts as decided ... */
  decisiveWinChance: 99,
  /** ... for this many plies in a row. */
  decisivePlies: 10,
  /** A game this long is called a draw. */
  maxPlies: 300,
} as const

export type Adjudication = { winner: Color } | { draw: true }

/**
 * Decides a game early once it is clearly won: White's winning chance (percent, one entry per
 * ply, as the side that moved saw it) stayed at or beyond the threshold for long enough.
 */
export function adjudicate(
  whiteWinChances: readonly number[],
  ply: number,
  rules: typeof ADJUDICATION = ADJUDICATION,
): Adjudication | undefined {
  const recent = whiteWinChances.slice(-rules.decisivePlies)
  if (recent.length === rules.decisivePlies) {
    if (recent.every((w) => w >= rules.decisiveWinChance)) return { winner: 'white' }
    if (recent.every((w) => w <= 100 - rules.decisiveWinChance)) return { winner: 'black' }
  }
  return ply >= rules.maxPlies ? { draw: true } : undefined
}
