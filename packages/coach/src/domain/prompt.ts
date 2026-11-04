/** What the coach is told about the situation the user asks in. */
export interface CoachContext {
  /** The position on the user's board (FEN). */
  fen?: string
  /** The game it belongs to, if any (PGN). */
  pgn?: string
  /** The user's rating, to pitch explanations at their level. */
  rating?: number
}

/**
 * The coach's rules. The same for every request, so providers can cache it; the situation goes
 * with each question instead (questionText).
 */
export const SYSTEM_PROMPT = `You are Chessy's chess coach. You help a player understand positions and games and get better.

Rules:
- Every chess fact you state (evaluations, best moves, lines, what a move threatens) comes from your tools. Never calculate variations yourself, never guess an evaluation, never invent moves. If a tool can't tell you, say so.
- Explain in plain words why things matter (threats, plans, weaknesses) for the player's level; keep engine numbers as support, not the point.
- Moves in standard algebraic notation (Nf3, exd5, O-O). Be concise: a few short paragraphs at most.
- Answer in the language the player writes in.`

/** A question as the model reads it: the situation on the board first, then the question. */
export function questionText(question: string, context: CoachContext = {}): string {
  const situation = [
    context.fen && `Position on my board (FEN): ${context.fen}`,
    context.pgn && `The game so far (PGN):\n${context.pgn}`,
    context.rating && `My rating: about ${context.rating}.`,
  ].filter(Boolean)
  return situation.length > 0 ? `${situation.join('\n')}\n\n${question}` : question
}
