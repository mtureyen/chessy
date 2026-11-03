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
   * Win % stop at 97.5 (lichess' cap), so with this gap the other moves never keep a won game:
   * finding the only win counts, finding one of several wins doesn't.
   */
  greatOnlyMoveGap: 12,
  /**
   * Brilliant = a best or nearly best move (less than `excellent` lost) that gives up at least
   * this much material (pawns), i.e. a piece or the exchange ...
   */
  brilliantMinSacrifice: 2,
  /** ... while not ending up worse than this (mover's win %) ... */
  brilliantMinWinAfter: 50,
  /**
   * ... and not completely winning anyway (mover's win %): with a human-move model, judged by the
   * second-best move; without one, by the position before ...
   */
  brilliantMaxWinWithout: 90,
  /**
   * ... and, with a human-move model, hard to find: players of the mover's rating play it less
   * often than this (0–1). Measured against chess.com's own brilliants (bun run review:bench).
   */
  brilliantMaxHumanProbability: 0.2,
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
  /**
   * Material (pawns) the move leaves for the taking: what the opponent could win by capturing
   * one of the mover's pieces (static exchange), less what the move captured; 0 if nothing.
   */
  sacrifice: number
  /**
   * Material (pawns) the mover is down once the engine's best reply takes the moved piece on its
   * square and the mover doesn't simply take back; 0 otherwise. Stricter than `sacrifice`.
   */
  sacrificeTaken: number
  /** A promotion is never brilliant: winning material that way is easy to see. */
  isPromotion?: boolean
  /** How likely a player of the mover's rating was to play this move (0–1), if known. */
  humanProbability?: number
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

  if (isBrilliant(facts, lost, config)) return 'brilliant'

  if (
    facts.isBestMove &&
    !facts.isRecapture &&
    !facts.inCheck &&
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

/**
 * A good piece sacrifice. With a human-move model (Maia) every way of leaving material for the
 * taking counts, as long as players of that rating rarely find the move. Without one only a
 * sacrifice the engine's reply actually takes counts: fewer brilliants, but rarely wrong ones.
 */
function isBrilliant(facts: MoveFacts, lost: number, config: typeof CLASSIFY_CONFIG): boolean {
  if (lost >= config.excellent || facts.inCheck || facts.isPromotion) return false
  if (facts.winAfter < config.brilliantMinWinAfter) return false
  if (facts.humanProbability === undefined) {
    return (
      facts.sacrificeTaken >= config.brilliantMinSacrifice &&
      facts.winBefore < config.brilliantMaxWinWithout
    )
  }
  return (
    facts.sacrifice >= config.brilliantMinSacrifice &&
    (facts.secondBestWin ?? facts.winBefore) < config.brilliantMaxWinWithout &&
    facts.humanProbability < config.brilliantMaxHumanProbability
  )
}
