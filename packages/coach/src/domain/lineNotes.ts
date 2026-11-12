import { z } from 'zod'
import { DRAWING_RULES, jsonIn, notesOf, WrittenNotes, type OpeningGuide } from './openingGuide'

/** What a line's notes are written from: the library's facts about it. */
export interface LineNotesFacts {
  /** The opening the line belongs to, and the side it is studied for. */
  opening: string
  side: 'white' | 'black'
  /** The named variation the line is in, when theory has a name for it. */
  variation?: string
  /**
   * The line move by move, each with the position after it (FEN) and, where the library has
   * games, how often the move is played there in percent.
   */
  line: { ply: number; move: string; fen: string; share?: number }[]
  /** The studied side's score in percent in the games that reached the end of the line. */
  score?: number
}

/** A note per move of the line, as the coach writes them. */
export type LineNotes = OpeningGuide['moves']

/** The same for every line, so providers can cache it; the facts go with each request. */
export const LINE_NOTES_PROMPT = `You are pawnia's chess coach. You explain one line of a chess opening move by move, for a club player who is learning it.

Rules:
- The moves and numbers come only from the facts given. Never invent a move order, a variation or an evaluation; if the facts don't show something, don't claim it.
- Write for the side that studies the opening ("you"). For the other side's moves, say what they are after and what it means for you. Plain words: plans, pawn structures, piece placement, typical tactics. No engine numbers.
- "share" is how often a move is played in its position in real games, in percent. Mention it only where it tells something: the main reply, a rare sideline.
- Moves in standard algebraic notation with move numbers ("3.e5", "3...Bf5").

Answer with one JSON object and nothing else:
{
  "moves": [{ "ply": <the ply from the line>, "note": "one or two sentences on why this move is played, without repeating the move", "draw": { "arrows": [{ "from": "c6", "to": "d5", "color": "green" }], "squares": [{ "square": "d5", "color": "yellow" }] } }]
}

One "moves" entry for every ply of the line, same plies, in order.

${DRAWING_RULES}`

/** The facts as the model reads them. */
export function lineNotesText(facts: LineNotesFacts): string {
  return JSON.stringify(facts)
}

const Reply = z.object({ moves: WrittenNotes })

/** The notes from the model's reply; undefined unless there is one for every ply. */
export function parseLineNotes(text: string, facts: LineNotesFacts): LineNotes | undefined {
  const parsed = Reply.safeParse(jsonIn(text))
  return parsed.success ? notesOf(parsed.data.moves, facts.line) : undefined
}
