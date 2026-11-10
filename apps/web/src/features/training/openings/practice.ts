import type { OpeningBody } from '@pawnia/contracts'

/** Practice goes as far as each side's 10th move. */
export const PRACTICE_PLIES = 20

/** A move that can come next, and how many of the user's games went that way. */
export interface Candidate {
  san: string
  games: number
}

/** The moves the user's games went on with from each position, keyed by the moves so far (SAN). */
export function nextMoves(lines: OpeningBody['lines']): Map<string, Candidate[]> {
  const table = new Map<string, Candidate[]>()
  for (const line of lines) {
    const key = line.moves.slice(0, -1).join(' ')
    const list = table.get(key) ?? []
    list.push({ san: line.moves.at(-1)!, games: line.tally.games })
    table.set(key, list)
  }
  return table
}

/**
 * The opponent's reply: one the user really met, picked by how often (so the common ones come up
 * most); without one, any of theory's; undefined when there is none either.
 */
export function pickReply(
  met: readonly Candidate[] | undefined,
  theory: readonly string[],
  random: () => number = Math.random,
): string | undefined {
  if (met && met.length > 0) {
    const total = met.reduce((sum, c) => sum + c.games, 0)
    let at = random() * total
    for (const candidate of met) {
      at -= candidate.games
      if (at < 0) return candidate.san
    }
    return met.at(-1)!.san
  }
  return theory.length > 0 ? theory[Math.floor(random() * theory.length)] : undefined
}
