/** Learning a line: the user watches it, then plays their side's moves from memory. */

/** The plies (1-based) the user plays in a line, for their side. */
export function yourPlies(line: readonly string[], side: 'white' | 'black'): number[] {
  return line.flatMap((_, i) => ((i % 2 === 0) === (side === 'white') ? [i + 1] : []))
}

/** Whether a move is the line's, ignoring check and annotation marks. */
export function sameMove(played: string, expected: string): boolean {
  const plain = (san: string) => san.replace(/[+#!?]+$/, '')
  return plain(played) === plain(expected)
}

/** How a run through the line went: moves played right at the first try, of the user's moves. */
export interface LearnScore {
  firstTry: number
  moves: number
}

/** Misses at one move after which the board shows where the move goes. */
export const HINT_AFTER = 2
