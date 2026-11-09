import type { ChatMessage } from './messages'

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
export const SYSTEM_PROMPT = `You are pawnia's chess coach. You help a player understand positions and games and get better.

Rules:
- Every chess fact you state (evaluations, best moves, lines, what a move threatens) comes from your tools. Never calculate variations yourself, never guess an evaluation, never invent moves. If a tool can't tell you, say so.
- Explain in plain words why things matter (threats, plans, weaknesses) for the player's level; keep engine numbers as support, not the point.
- Moves in standard algebraic notation (Nf3, exd5, O-O). Be concise: a few short paragraphs at most.
- Answer in the language the player writes in.

Tools:
- evaluate_position for any claim about a position; human_moves to tell whether a move is natural or hard to find at the player's rating, or which mistake people tend to make there.
- Why a game went the way it did: game_review gives its key moments (the game on the board, or a game id from search_games); look closer with evaluate_position on a moment's position.
- The player's own games: search_games finds them (e.g. "my last loss"), stats gives results, trends and weaknesses. Move-quality numbers cover only reviewed games: say how many. Treat a handful of games as a hint, not a pattern. For how they play now, look at their recent games (lastGames, e.g. 30), not their whole history: old games say little about today.
- show_on_board when a move, threat or plan is easier to see than to read: one call with everything you refer to, then name the colours in your answer.`

/**
 * The rules of a comment during a game. The player can't ask anything back and the coach has no
 * tools here: all it has is what commentText tells it about the move just played.
 */
export const COMMENT_PROMPT = `You are pawnia's chess coach, watching a game the player is still playing. They just made a notable move and you say a word about it.

Rules:
- One or two short sentences about the move just played: what it gave up, or why it was good. In plain words for the player's level, without engine numbers.
- Never say or hint at what to play now or what should have been played instead: name no other move, for either side, and no plan. The player is in the middle of a game; that is for after it.
- State only what the facts given and the position plainly show. Never calculate variations, never guess an evaluation.
- No greeting and no advice for later moves.`

/** A notable move of the player's in a running game: all a comment on it goes on. */
export interface CommentedMove {
  /** The position after the move (FEN). */
  fen: string
  color: 'white' | 'black'
  moveNumber: number
  san: string
  verdict: 'brilliant' | 'great' | 'miss' | 'mistake' | 'blunder'
  /** The player's winning chances (%) before and after it. */
  winBefore: number
  winAfter: number
  /** A piece of the player's the opponent can now win, and what it would gain (pawns). */
  hanging?: { piece: string; square: string; pawns: number }
  /** The opponent can now force mate in this many moves. */
  mateIn?: number
  rating?: number
}

const VERDICTS: Record<CommentedMove['verdict'], string> = {
  brilliant: 'a brilliant move',
  great: 'a great move, the only good one',
  miss: 'a missed chance: the opponent had just gone wrong and this let them off',
  mistake: 'a mistake',
  blunder: 'a blunder',
}

/** A move as the model reads it: the facts of the move and nothing else. */
export function commentText(move: CommentedMove): string {
  const number = `${move.moveNumber}${move.color === 'white' ? '.' : '...'}`
  return [
    `I play ${move.color} and just played ${number} ${move.san}: ${VERDICTS[move.verdict]}.`,
    `Position after it (FEN): ${move.fen}`,
    `My winning chances went from ${Math.round(move.winBefore)}% to ${Math.round(move.winAfter)}%.`,
    move.hanging &&
      `My ${move.hanging.piece} on ${move.hanging.square} can now be won (worth about ${move.hanging.pawns} pawns).`,
    move.mateIn && `My opponent can now force mate in ${move.mateIn}.`,
    move.rating && `My rating: about ${move.rating}.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** A question as the model reads it: the situation on the board first, then the question. */
export function questionText(question: string, context: CoachContext = {}): string {
  const situation = [
    context.fen && `Position on my board (FEN): ${context.fen}`,
    context.pgn && `The game so far (PGN):\n${context.pgn}`,
    context.rating && `My rating: about ${context.rating}.`,
  ].filter(Boolean)
  return situation.length > 0 ? `${situation.join('\n')}\n\n${question}` : question
}

/** How many earlier exchanges a follow-up carries. */
export const FOLLOW_UP_EXCHANGES = 10

/**
 * A question for an agent that keeps no conversation of its own: the earlier questions and
 * answers first (only their words, the last FOLLOW_UP_EXCHANGES of them), then the question.
 */
export function followUpText(earlier: readonly ChatMessage[], question: string): string {
  const exchanges: string[] = []
  for (const message of earlier) {
    if (message.role === 'user') exchanges.push(`Me: ${message.text}`)
    if (message.role === 'assistant' && message.text.trim()) {
      exchanges.push(`You: ${message.text.trim()}`)
    }
  }
  const recent = exchanges.slice(-2 * FOLLOW_UP_EXCHANGES)
  if (recent.length === 0) return question
  return `Our conversation so far:\n\n${recent.join('\n\n')}\n\n---\n\n${question}`
}
