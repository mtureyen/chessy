import { whiteWinChance, type EngineLine } from '@chessy/analysis'
import type { Color } from '@chessy/chess'
import type { BotLevel } from './levels'
import { pickWeighted, type Random } from './random'

export interface Candidate {
  /** UCI. */
  move: string
  /** Winning chance for the bot after this move, in percent. */
  winChance: number
  /** Win-% given away compared with the best move. */
  loss: number
  /** Chance the bot plays it (0–1). */
  probability: number
}

export interface BotChoice {
  move: string
  /** Every move the bot considered, best first, with the chance it had. */
  candidates: Candidate[]
}

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
  const bestWin = win(best)
  const options = ranked
    .map((line) => ({
      move: line.pv[0]!,
      winChance: win(line),
      loss: Math.max(0, bestWin - win(line)),
    }))
    .filter((option, index) => index === 0 || option.loss <= level.maxLoss)

  const { score } = best
  const forcedMate =
    score.type === 'mate' && score.winner === turn && score.moves <= level.seesMateIn
  const weights = forcedMate
    ? options.map((_, index) => (index === 0 ? 1 : 0))
    : options.map((option) => Math.exp(-option.loss / level.temperature))
  const total = weights.reduce((sum, w) => sum + w, 0)
  const candidates = options.map((option, index) => ({
    ...option,
    probability: weights[index]! / total,
  }))
  return { move: candidates[pickWeighted(weights, random)]!.move, candidates }
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
