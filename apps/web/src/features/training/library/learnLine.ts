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

/** The help in a run through a line: when the arrow comes, and how it is told. */
export interface Help {
  /** Misses at a move after which the arrow shows it; 0 shows it from the start. */
  arrowAfter: number
  /** What this run asks for. */
  step: string
  /** The button that starts this run after the one before. */
  again: string
}

/**
 * The help fades run by run: the first run shows every move, the second shows it after a miss,
 * from the third on the line is played from memory. No run (a review, or arrows switched off) is
 * from memory too.
 */
export function helpFor(run: number | undefined): Help {
  if (run === 0)
    return {
      arrowAfter: 0,
      step: 'play your moves. This time the arrows show them.',
      again: 'Play it again',
    }
  if (run === 1)
    return {
      arrowAfter: 1,
      step: 'play your moves. An arrow comes only after a miss.',
      again: 'Again, with less help',
    }
  return {
    arrowAfter: HINT_AFTER,
    step: 'play your moves from memory.',
    again: run === 2 ? 'Again, from memory' : 'Play it again',
  }
}

/** What a move that isn't the line's is worth otherwise, e.g. "2...e6 is theory too, …". */
export function verdictText(
  move: string,
  verdict: 'theory' | 'good' | 'playable' | 'wrong',
): string {
  switch (verdict) {
    case 'theory':
      return `${move} is theory too, but it is another line.`
    case 'good':
      return `${move} is a good move, but not this line’s.`
    case 'playable':
      return `${move} is playable, but this line’s move is better.`
    case 'wrong':
      return `${move} is a mistake here.`
  }
}

/** The guide's notes for a line, by ply, as far as the line follows the guide's moves. */
export function guideNotes(
  line: readonly string[],
  moves: readonly { ply: number; san: string; note: string }[],
): Map<number, string> {
  const notes = new Map<number, string>()
  for (const move of moves) {
    if (line[move.ply - 1] !== move.san) break
    notes.set(move.ply, move.note)
  }
  return notes
}
