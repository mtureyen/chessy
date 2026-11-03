import { whiteWinChance, type EngineLine, type Score } from '@chessy/analysis'
import type { Color } from '@chessy/chess'
import type { BotLevel } from './levels'
import { pickWeighted, type Random } from './random'

export interface Candidate {
  /** UCI. */
  move: string
  /** Winning chance for the bot after this move, in percent. */
  winChance: number
  /**
   * What the move gives away compared with the best one: win-%, or centipawns / 10 when that is
   * more (see `lossOf`).
   */
  loss: number
  /** Chance the bot plays it (0–1). */
  probability: number
}

export interface BotChoice {
  move: string
  /** How the move was chosen: from the engine's ranking, or as a human of the level's rating. */
  by: 'engine' | 'human'
  /**
   * The bot's winning chance as it sees it, in percent: the engine's, or for a human-like move
   * the result humans of these ratings tend to get from here.
   */
  winChance?: number
  /** Every move the engine ranked, best first, with the chance it had (engine choices only). */
  candidates: Candidate[]
}

/**
 * Centipawns per point of loss. Win-% alone flattens out in decided positions (a lost side loses
 * almost no win-% by also dropping a piece), so the bot would play at random there.
 */
const CENTIPAWNS_PER_POINT = 10
const CENTIPAWN_CAP = 1500

/**
 * Picks the bot's move from the engine's ranked lines. Each move is weighted by
 * exp(-loss / temperature), so small slips are common and big blunders rare, like in human play.
 * Moves beyond `maxLoss` are never picked; a short enough forced mate always is.
 * Returns undefined when there are no lines.
 */
export function selectMove(
  lines: readonly EngineLine[],
  turn: Color,
  level: BotLevel,
  random: Random,
): BotChoice | undefined {
  const ranked = uniqueMoves(lines)
  const best = ranked[0]
  if (!best) return undefined

  const win = (line: EngineLine) => {
    const white = whiteWinChance(line.score)
    return turn === 'white' ? white : 100 - white
  }
  const options = ranked.map((line) => ({
    move: line.pv[0]!,
    winChance: win(line),
    loss: lossOf(line, best, turn),
  }))
  const playable = options.filter((option, index) => index === 0 || option.loss <= level.maxLoss)

  const { score } = best
  const forcedMate =
    score.type === 'mate' && score.winner === turn && score.moves <= level.seesMateIn
  const weights = forcedMate
    ? playable.map((_, index) => (index === 0 ? 1 : 0))
    : playable.map((option) => Math.exp(-option.loss / level.temperature))
  const total = weights.reduce((sum, w) => sum + w, 0)
  const candidates = playable.map((option, index) => ({
    ...option,
    probability: weights[index]! / total,
  }))
  return {
    move: candidates[pickWeighted(weights, random)]!.move,
    by: 'engine',
    winChance: candidates[0]!.winChance,
    candidates,
  }
}

/**
 * What playing `line` instead of `best` gives away: win-%, or centipawns / 10 if more. With a
 * forced mate of its own only win-% counts, so a weak level can still miss a long mate.
 */
function lossOf(line: EngineLine, best: EngineLine, turn: Color): number {
  const win = (score: Score) => (turn === 'white' ? 1 : -1) * whiteWinChance(score)
  const winLoss = Math.max(0, win(best.score) - win(line.score))
  if (best.score.type === 'mate' && best.score.winner === turn) return winLoss
  const centipawns = (score: Score) => {
    const white =
      score.type === 'mate'
        ? (score.winner === 'white' ? 1 : -1) * CENTIPAWN_CAP
        : Math.max(-CENTIPAWN_CAP, Math.min(CENTIPAWN_CAP, score.value))
    return turn === 'white' ? white : -white
  }
  return Math.max(winLoss, (centipawns(best.score) - centipawns(line.score)) / CENTIPAWNS_PER_POINT)
}

/** Lines in rank order, one per first move (engines can repeat a move across MultiPV updates). */
function uniqueMoves(lines: readonly EngineLine[]): EngineLine[] {
  const seen = new Set<string>()
  return [...lines]
    .sort((a, b) => a.rank - b.rank)
    .filter((line) => {
      const move = line.pv[0]
      if (!move || seen.has(move)) return false
      seen.add(move)
      return true
    })
}
