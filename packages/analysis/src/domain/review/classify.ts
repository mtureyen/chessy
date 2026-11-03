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
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
]

export interface ClassifyConfig {
  excellent: number
  good: number
  inaccuracy: number
  mistake: number
  expectedPointsSlope: { at500: number; at2000: number }
  bestMaxLoss: number
  blunderMaxWinAfter: number
  greatOnlyMoveGap: number
  greatMinOpponentLoss: number
  brilliantMinSacrifice: number
  brilliantMinWinAfter: number
  brilliantMaxWinWithout: number
  brilliantMaxHumanProbability: number
  missMinOpponentLoss: number
  missGivesBack: { min: number; max: number }
}

/**
 * Fitted to reference labels for 6,158 moves of 92 chess.com games, players rated about 400–2400
 * (`bun run bench:references`, `bun run review:bench --references`): the classes agree for 61 %
 * of those moves (52 % with lichess' fixed curve and the earlier miss rule), 61 % on games left
 * out of the fit.
 */
export const CLASSIFY_CONFIG: ClassifyConfig = {
  /** Upper bounds of expected points lost (0–1) per class, chess.com's published thresholds. */
  excellent: 0.02,
  good: 0.05,
  inaccuracy: 0.1,
  mistake: 0.2,
  /**
   * Expected points come from the evaluation like lichess' winning chances, but flatter for weaker
   * players, as chess.com's model is: a pawn changes a beginner's results far less than a master's.
   * The slope relative to lichess' (0.00368 per centipawn), linear in the mover's rating between
   * 500 and 2000 and constant outside; 1500 when unknown.
   */
  expectedPointsSlope: { at500: 0.35, at2000: 0.8 },
  /** Best = the engine's top move, or one that loses less than this (expected points). */
  bestMaxLoss: 0.0005,
  /**
   * A blunder leaves the mover worse off than this (win %); a big drop that still keeps the game
   * is a mistake. chess.com: a blunder must "lose material or allow checkmate".
   */
  blunderMaxWinAfter: 30,
  /**
   * Great = only good move: the second-best line is at least this many win-% points worse. Any gap
   * from 10 to 20 matches the reference labels about equally well (F1 0.54); 14 calls as many
   * greats as they have. Win % stop at 97.5 (lichess' cap), so with this gap the other moves never
   * keep a won game: finding the only win counts, finding one of several wins doesn't.
   */
  greatOnlyMoveGap: 14,
  /**
   * ... and it punishes a mistake: the opponent's move before lost at least this much. The only
   * good move in a quiet position is just best (reference labels: 142 best to 28 great there).
   * 0.05 balances finding greats (39 %) against calling them right (62 %); 0.1 is 34 % / 66 %.
   */
  greatMinOpponentLoss: 0.05,
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
  /**
   * Miss = the opponent's previous move lost at least this many expected points, and this move
   * gives most of that back: between these shares of it (more is a new blunder of its own).
   */
  missMinOpponentLoss: 0.12,
  missGivesBack: { min: 0.3, max: 2 },
}

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
  /** The mover's rating; sets how much an evaluation is worth in expected points. */
  rating?: number
  /**
   * The evaluation before and after, in centipawns from the mover's side, capped at
   * ±CLASSIFY_CP_CEILING (a mate counts as that). Without them, they follow from the win %.
   */
  evalBefore?: number
  evalAfter?: number
  /**
   * The move takes on the square the opponent's last move went to: a recapture, or taking the
   * piece that just moved. Rarely a "great" find either way.
   */
  isRecapture: boolean
  /** The mover was in check: escaping is often the only move, but rarely a "great" find. */
  inCheck: boolean
  /** Expected points the opponent lost with the move before; undefined for the first move. */
  opponentLoss?: number
}

/** lichess' winning chances per centipawn: win % = 100 / (1 + e^(−slope · cp)). */
const LICHESS_SLOPE = 0.00368208
const DEFAULT_RATING = 1500
/**
 * Evaluations for classifying are capped higher than lichess' ±1000 for accuracy, so moves in
 * decided positions still differ (fitted to reference labels: 1500 beats 1000).
 */
export const CLASSIFY_CP_CEILING = 1500

/** Expected points (0–1) the move gave away, for a player of the mover's rating. */
export function expectedPointsLost(
  facts: Pick<MoveFacts, 'winBefore' | 'winAfter' | 'rating' | 'evalBefore' | 'evalAfter'>,
  config: ClassifyConfig = CLASSIFY_CONFIG,
): number {
  const { at500, at2000 } = config.expectedPointsSlope
  const t = Math.min(1, Math.max(0, ((facts.rating ?? DEFAULT_RATING) - 500) / 1500))
  const slope = LICHESS_SLOPE * (at500 + t * (at2000 - at500))
  const points = (cp: number) => 1 / (1 + Math.exp(-slope * cp))
  const before = facts.evalBefore ?? centipawns(facts.winBefore)
  const after = facts.evalAfter ?? centipawns(facts.winAfter)
  return Math.max(0, points(before) - points(after))
}

/** Back from lichess' win % (capped at ±1000 cp, so at most 97.5) to centipawns. */
function centipawns(winPercent: number): number {
  const p = Math.min(Math.max(winPercent / 100, 1e-6), 1 - 1e-6)
  return -Math.log(1 / p - 1) / LICHESS_SLOPE
}

export function classifyMove(facts: MoveFacts, config = CLASSIFY_CONFIG): MoveClass {
  const lost = expectedPointsLost(facts, config)

  // chess.com has no "forced" class: the only legal move is also the best one.
  if (facts.legalMoves === 1) return 'best'
  if (facts.inBook) return 'book'

  if (isBrilliant(facts, lost, config)) return 'brilliant'

  if (
    facts.isBestMove &&
    !facts.isRecapture &&
    !facts.inCheck &&
    facts.secondBestWin !== undefined &&
    facts.winBefore - facts.secondBestWin >= config.greatOnlyMoveGap &&
    (facts.opponentLoss ?? 0) >= config.greatMinOpponentLoss
  ) {
    return 'great'
  }

  if (facts.isBestMove || lost < config.bestMaxLoss) return 'best'

  const opponentLoss = facts.opponentLoss ?? 0
  if (
    lost >= config.good &&
    opponentLoss >= config.missMinOpponentLoss &&
    lost >= opponentLoss * config.missGivesBack.min &&
    lost <= opponentLoss * config.missGivesBack.max
  ) {
    return 'miss'
  }

  if (lost < config.excellent) return 'excellent'
  if (lost < config.good) return 'good'
  if (lost < config.inaccuracy) return 'inaccuracy'
  if (lost < config.mistake || facts.winAfter >= config.blunderMaxWinAfter) return 'mistake'
  return 'blunder'
}

/**
 * A good piece sacrifice. With a human-move model (Maia) every way of leaving material for the
 * taking counts, as long as players of that rating rarely find the move. Without one only a
 * sacrifice the engine's reply actually takes counts: fewer brilliants, but rarely wrong ones.
 */
function isBrilliant(facts: MoveFacts, lost: number, config: ClassifyConfig): boolean {
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
