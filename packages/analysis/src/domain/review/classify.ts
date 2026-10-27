/**
 * Move classification in the style of chess.com's Game Review.
 *
 * The expected-points thresholds are chess.com's published ones (support.chess.com, "How are moves
 * classified?"). Brilliant, great and miss are only described in words there; the rules below are
 * our own heuristics, all tunable in CLASSIFY_CONFIG.
 */
export type MoveClass =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'forced'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder'

export const MOVE_CLASSES: readonly MoveClass[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'forced',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
]

export const CLASSIFY_CONFIG = {
  /** Upper bounds of expected points lost (0–1) per class. */
  excellent: 0.02,
  good: 0.05,
  inaccuracy: 0.1,
  mistake: 0.2,
  /**
   * Great = only good move: the second-best line is at least this many win-% points worse.
   * First calibration on one sharp real game: 10 also flagged routine king moves; 12 (plus no escapes
   * from check) kept 4. Still to be checked against chess.com's own reviews of the same games.
   */
  greatOnlyMoveGap: 12,
  /** ... and only while the game is still open: finding mate in an already won position isn't "great". */
  greatMaxWinBefore: 90,
  /** Brilliant = sound sacrifice of at least this much material (pawns) ... */
  brilliantMinSacrifice: 2,
  /** ... while not ending up worse than this (mover's win %) ... */
  brilliantMinWinAfter: 50,
  /** ... and not already winning anyway (mover's win % before). */
  brilliantMaxWinBefore: 90,
  /** Miss = the opponent's previous move lost at least this many expected points ... */
  missMinOpponentLoss: 0.1,
  /** ... and this move gives back at least this share of it. */
  missGivesBackShare: 0.5,
} as const

/** Everything known about one move that the classification needs. Win % are from the mover's view. */
export interface MoveFacts {
  /** The engine's best move in the position before (UCI). */
  isBestMove: boolean
  winBefore: number
  winAfter: number
  /** The second-best line's win % in the position before, if the engine reported one. */
  secondBestWin?: number
  legalMoves: number
  inBook: boolean
  /** Material (pawns) the mover is down after the opponent takes the offered piece; 0 if none. */
  sacrifice: number
  /** The move recaptures on the square the opponent just captured on. */
  isRecapture: boolean
  /** The mover was in check: escaping is often the only move, but rarely a "great" find. */
  inCheck: boolean
  /** Expected points the opponent lost with the move before; undefined for the first move. */
  opponentLoss?: number
}

/** Expected points (0–1) the move gave away. */
export function expectedPointsLost(facts: Pick<MoveFacts, 'winBefore' | 'winAfter'>): number {
  return Math.max(0, facts.winBefore - facts.winAfter) / 100
}

export function classifyMove(facts: MoveFacts, config = CLASSIFY_CONFIG): MoveClass {
  const lost = expectedPointsLost(facts)

  if (facts.legalMoves === 1) return 'forced'
  if (facts.inBook) return 'book'

  if (
    lost < config.excellent &&
    facts.sacrifice >= config.brilliantMinSacrifice &&
    facts.winAfter >= config.brilliantMinWinAfter &&
    facts.winBefore < config.brilliantMaxWinBefore
  ) {
    return 'brilliant'
  }

  if (
    facts.isBestMove &&
    !facts.isRecapture &&
    !facts.inCheck &&
    facts.winBefore < config.greatMaxWinBefore &&
    facts.secondBestWin !== undefined &&
    facts.winBefore - facts.secondBestWin >= config.greatOnlyMoveGap
  ) {
    return 'great'
  }

  if (facts.isBestMove) return 'best'
  if (lost < config.excellent) return 'excellent'
  if (lost < config.good) return 'good'

  const opponentLoss = facts.opponentLoss ?? 0
  if (
    lost < config.mistake &&
    opponentLoss >= config.missMinOpponentLoss &&
    lost >= opponentLoss * config.missGivesBackShare
  ) {
    return 'miss'
  }

  if (lost < config.inaccuracy) return 'inaccuracy'
  if (lost < config.mistake) return 'mistake'
  return 'blunder'
}
