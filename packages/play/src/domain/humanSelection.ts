import type { HumanStyle } from './levels'
import { pickWeighted, type Random } from './random'

/**
 * Picks a move the way a human of the level would: only from the moves that make up the top
 * `topP` of the human probability (so no move nobody plays), each weighted by
 * probability^(1 / temperature). Above 1 the level plays its less common moves more often, i.e.
 * weaker but still human moves; below 1 it sticks to the most common ones.
 * Returns undefined when there are no moves.
 */
export function sampleHumanMove(
  moves: readonly { move: string; probability: number }[],
  style: Pick<HumanStyle, 'temperature' | 'topP'>,
  random: Random,
): string | undefined {
  const ranked = [...moves].sort((a, b) => b.probability - a.probability)
  const kept: typeof ranked = []
  let mass = 0
  for (const option of ranked) {
    if (kept.length > 0 && mass >= style.topP) break
    kept.push(option)
    mass += option.probability
  }
  if (kept.length === 0) return undefined
  const weights = kept.map((option) => option.probability ** (1 / style.temperature))
  return kept[pickWeighted(weights, random)]!.move
}
