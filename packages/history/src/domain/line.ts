import { importPgn } from '@chessy/chess'

/**
 * A game's main line: where it starts and its moves (UCI). A review is of a line, so it belongs
 * to every stored game with that line, also one imported after the review.
 */
export interface GameLine {
  startFen: string
  moves: readonly string[]
}

/** The main line of a PGN, without variations. Throws PgnImportError for an unreadable PGN. */
export function gameLine(pgn: string): GameLine {
  const { game } = importPgn(pgn)
  game.toStart()
  return { startFen: game.root.fen, moves: game.line().map((node) => node.move!.uci) }
}

/** One string per line, e.g. as a database key; equal lines give equal keys. */
export function lineText({ startFen, moves }: GameLine): string {
  return `${startFen}|${moves.join(' ')}`
}
