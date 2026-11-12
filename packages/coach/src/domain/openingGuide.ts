import { z } from 'zod'

/** What an opening's guide is written from: the library's facts, nothing the model must guess. */
export interface OpeningGuideFacts {
  name: string
  /** The side the opening is studied for. */
  side: 'white' | 'black'
  /** Its defining moves, numbered: "1.e4 c6". */
  main: string
  /**
   * The line the guide annotates move by move: the main moves and the most played after them,
   * each with the position after it (FEN), so drawings are made on the real board.
   */
  line: { ply: number; move: string; fen: string }[]
  /** The most played named variations, with their moves and the opening side's score. */
  variations: { name: string; moves: string; games: number; score?: number }[]
  /** What the other side plays most at the main position, with the opening side's score after it. */
  replies: { move: string; share: number; score?: number }[]
  /** The opening side's score in percent per rating band. */
  scores: Record<string, number>
  /** Traps in it, each in a sentence. */
  traps: string[]
}

export type DrawingColor = 'green' | 'red' | 'blue' | 'yellow'

/** The idea of a move as a picture, on the position after it. */
export interface GuideDrawing {
  arrows: { from: string; to: string; color: DrawingColor }[]
  squares: { square: string; color: DrawingColor }[]
}

/** An opening's guide as the coach writes it. */
export interface OpeningGuide {
  story: string
  ideas: string
  opponents: string
  moves: { ply: number; note: string; draw?: GuideDrawing }[]
}

/** The most arrows, and the most squares, in one drawing: more is a tangle. */
const MAX_DRAWN = 3

/** How a note's drawing is asked for, in every prompt that has notes per move. */
export const DRAWING_RULES = `"draw" is optional: the idea of the move as a picture on the board right after it (the line gives that position as "fen"). Add it where it helps to see what the note says, and leave it out where there is nothing to show.
- An arrow starts on a square that holds a piece in that position, and points to where the piece aims, what it supports or attacks, or where it will go next. A square marks a key point.
- Colours: green for your side's plans and support, red for what the other side threatens or attacks, yellow for a key square or a weakness, blue for an option kept open.
- At most three arrows and three squares. Draw only what the note says.`

/** The same for every opening, so providers can cache it; the facts go with each request. */
export const OPENING_GUIDE_PROMPT = `You are pawnia's chess coach. You write a study guide for one chess opening, for a club player who wants to learn it.

Rules:
- Moves, lines, numbers and traps come only from the facts given. Never invent a move order, a variation or an evaluation; if the facts don't show something, don't claim it.
- For the name and history you may use what is well established in chess history (who it is named after, where it was first played or analysed, famous players of it). Say less rather than guess: no invented dates, games or people.
- Write for the side that plays the opening ("you"). Plain words: plans, pawn structures, piece placement, typical tactics. No engine numbers; percentages only where they tell a story.
- Moves in standard algebraic notation with move numbers ("3.e5", "3...Bf5"). Use Markdown sparingly: short paragraphs, a few bullet points where they help.

Answer with one JSON object and nothing else:
{
  "story": "where the name comes from and the opening's history, two short paragraphs",
  "ideas": "what the opening is about for you: the plans, the typical structures, where the pieces go, three short paragraphs or bullets",
  "opponents": "what the other side tries most (from the replies and variations given) and how to handle each, plus the traps to set or avoid if any are given",
  "moves": [{ "ply": <the ply from the line>, "note": "one sentence on why this move is played, without repeating the move", "draw": { "arrows": [{ "from": "c6", "to": "d5", "color": "green" }], "squares": [{ "square": "d5", "color": "yellow" }] } }]
}

One "moves" entry for every ply of the line, same plies, in order.

${DRAWING_RULES}`

/** The facts as the model reads them. */
export function openingGuideText(facts: OpeningGuideFacts): string {
  return JSON.stringify(facts)
}

/** Notes per move as a model writes them. A drawing is checked apart: a bad one is left out. */
export const WrittenNotes = z.array(
  z.object({ ply: z.number().int(), note: z.string().min(1), draw: z.unknown().optional() }),
)

const Reply = z.object({
  story: z.string().min(1),
  ideas: z.string().min(1),
  opponents: z.string().min(1),
  moves: WrittenNotes,
})

const Square = z.string().regex(/^[a-h][1-8]$/)
const Color = z.enum(['green', 'red', 'blue', 'yellow'])
const Drawing = z.object({
  arrows: z.array(z.unknown()).default([]),
  squares: z.array(z.unknown()).default([]),
})
const Arrow = z.object({ from: Square, to: Square, color: Color })
const Mark = z.object({ square: Square, color: Color })

/** The guide from the model's reply; undefined unless it is complete (a note for every ply). */
export function parseOpeningGuide(
  text: string,
  facts: OpeningGuideFacts,
): OpeningGuide | undefined {
  const parsed = Reply.safeParse(jsonIn(text))
  if (!parsed.success) return undefined
  const { story, ideas, opponents } = parsed.data
  const moves = notesOf(parsed.data.moves, facts.line)
  return moves && { story, ideas, opponents, moves }
}

/** The JSON object in a model's reply, also with text around it; undefined when there is none. */
export function jsonIn(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
}

/**
 * The notes of a line, one per ply and in its order, each without its move in front and with what
 * can be drawn of its drawing. Undefined unless every ply has a note.
 */
export function notesOf(
  written: z.infer<typeof WrittenNotes>,
  line: OpeningGuideFacts['line'],
): OpeningGuide['moves'] | undefined {
  const notes = line.map(({ ply, move, fen }) => {
    const found = written.find((m) => m.ply === ply)
    if (!found) return undefined
    const draw = drawing(found.draw, fen)
    return { ply, note: withoutMove(found.note, move), ...(draw && { draw }) }
  })
  return notes.some((note) => !note?.note) ? undefined : (notes as OpeningGuide['moves'])
}

/**
 * What can be drawn of the model's drawing on the position: arrows from a square that holds a
 * piece, squares on the board, at most three of each. Undefined when nothing is left.
 */
function drawing(raw: unknown, fen: string): GuideDrawing | undefined {
  const parsed = Drawing.safeParse(raw)
  if (!parsed.success) return undefined
  const pieces = occupied(fen)
  const arrows = parsed.data.arrows
    .flatMap((a) => {
      const arrow = Arrow.safeParse(a)
      return arrow.success ? [arrow.data] : []
    })
    .filter((a) => a.from !== a.to && pieces.has(a.from))
    .slice(0, MAX_DRAWN)
  const squares = parsed.data.squares
    .flatMap((s) => {
      const mark = Mark.safeParse(s)
      return mark.success ? [mark.data] : []
    })
    .slice(0, MAX_DRAWN)
  return arrows.length + squares.length > 0 ? { arrows, squares } : undefined
}

/** The squares that hold a piece, from a FEN's piece placement. */
function occupied(fen: string): Set<string> {
  const squares = new Set<string>()
  const ranks = (fen.split(' ')[0] ?? '').split('/')
  ranks.forEach((rank, i) => {
    let file = 0
    for (const char of rank) {
      if (/\d/.test(char)) file += Number(char)
      else squares.add(`${'abcdefgh'[file++]}${8 - i}`)
    }
  })
  return squares
}

/** A note without the move it is about in front ("1.e4 White takes…" → "White takes…"). */
function withoutMove(note: string, move: string): string {
  const san = move.replace(/^\d+\.(\.\.)?/, '')
  for (const prefix of [move, move.replace('...', '… '), san]) {
    if (note.startsWith(prefix)) return note.slice(prefix.length).replace(/^[\s:,–-]+/, '')
  }
  return note
}
