import { z } from 'zod'

/** What an opening's guide is written from: the library's facts, nothing the model must guess. */
export interface OpeningGuideFacts {
  name: string
  /** The side the opening is studied for. */
  side: 'white' | 'black'
  /** Its defining moves, numbered: "1.e4 c6". */
  main: string
  /** The line the guide annotates move by move: the main moves and the most played after them. */
  line: { ply: number; move: string }[]
  /** The most played named variations, with their moves and the opening side's score. */
  variations: { name: string; moves: string; games: number; score?: number }[]
  /** What the other side plays most at the main position, with the opening side's score after it. */
  replies: { move: string; share: number; score?: number }[]
  /** The opening side's score in percent per rating band. */
  scores: Record<string, number>
  /** Traps in it, each in a sentence. */
  traps: string[]
}

/** An opening's guide as the coach writes it. */
export interface OpeningGuide {
  story: string
  ideas: string
  opponents: string
  moves: { ply: number; note: string }[]
}

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
  "moves": [{ "ply": <the ply from the line>, "note": "one sentence on why this move is played, without repeating the move" }]
}

One "moves" entry for every ply of the line, same plies, in order.`

/** The facts as the model reads them. */
export function openingGuideText(facts: OpeningGuideFacts): string {
  return JSON.stringify(facts)
}

const Reply = z.object({
  story: z.string().min(1),
  ideas: z.string().min(1),
  opponents: z.string().min(1),
  moves: z.array(z.object({ ply: z.number().int(), note: z.string().min(1) })),
})

/** The guide from the model's reply; undefined unless it is complete (a note for every ply). */
export function parseOpeningGuide(
  text: string,
  facts: OpeningGuideFacts,
): OpeningGuide | undefined {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return undefined
  let json: unknown
  try {
    json = JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
  const parsed = Reply.safeParse(json)
  if (!parsed.success) return undefined
  const { story, ideas, opponents, moves } = parsed.data
  const notes = facts.line.map(({ ply, move }) => {
    const found = moves.find((m) => m.ply === ply)
    return found && { ply, note: withoutMove(found.note, move) }
  })
  if (notes.some((note) => !note?.note)) return undefined
  return { story, ideas, opponents, moves: notes as OpeningGuide['moves'] }
}

/** A note without the move it is about in front ("1.e4 White takes…" → "White takes…"). */
function withoutMove(note: string, move: string): string {
  const san = move.replace(/^\d+\.(\.\.)?/, '')
  for (const prefix of [move, move.replace('...', '… '), san]) {
    if (note.startsWith(prefix)) return note.slice(prefix.length).replace(/^[\s:,–-]+/, '')
  }
  return note
}
