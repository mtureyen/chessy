import type { EncodedPosition } from './encoding'

export interface HumanMove {
  /** UCI. */
  move: string
  /** How likely a player of the given rating plays it (0–1). */
  probability: number
}

export interface HumanMovePrediction {
  /** All legal moves, most likely first. */
  moves: HumanMove[]
  /**
   * How the game tends to end from here between players of these ratings, for the side to move:
   * win + half the draws, 0–1. A prediction of human results, not an engine evaluation.
   */
  expectedScore: number
}

/**
 * Turns the model's raw outputs for one position into move probabilities (softmax over the
 * legal moves only) and the expected score. `value` holds loss, draw, win for the side to move.
 */
export function decodePrediction(
  position: EncodedPosition,
  logits: ArrayLike<number>,
  value: ArrayLike<number>,
): HumanMovePrediction {
  const legalLogits = position.legal.map((index) => logits[index]!)
  const top = Math.max(...legalLogits)
  const weights = legalLogits.map((logit) => Math.exp(logit - top))
  const total = weights.reduce((sum, w) => sum + w, 0)
  const moves = position.moves
    .map((move, i) => ({ move, probability: weights[i]! / total }))
    .sort((a, b) => b.probability - a.probability)

  const [loss, draw, win] = [value[0]!, value[1]!, value[2]!]
  const peak = Math.max(loss, draw, win)
  const [l, d, w] = [loss, draw, win].map((v) => Math.exp(v - peak)) as [number, number, number]
  return { moves, expectedScore: (w + d / 2) / (l + d + w) }
}
