import { createGame, type Color } from '@chessy/chess'

export interface LineMove {
  uci: string
  san: string
  /** The side making the move. */
  color: Color
  moveNumber: number
}

/** Replays an engine line (UCI) from a position and returns it in SAN. Stops at the first illegal move. */
export function toSanLine(fen: string, pv: readonly string[], maxMoves = pv.length): LineMove[] {
  const game = createGame(fen)
  const moves: LineMove[] = []
  for (const uci of pv.slice(0, maxMoves)) {
    const move = game.play(uci)?.move
    if (!move) break
    moves.push({ uci: move.uci, san: move.san, color: move.color, moveNumber: move.moveNumber })
  }
  return moves
}

/** `12. Nf3 Nc6 13. Bb5`, or `12... Nc6 13. Bb5` when the line starts with Black. */
export function formatSanLine(moves: readonly LineMove[]): string {
  return moves
    .map((m, i) => {
      if (m.color === 'white') return `${m.moveNumber}. ${m.san}`
      return i === 0 ? `${m.moveNumber}... ${m.san}` : m.san
    })
    .join(' ')
}
