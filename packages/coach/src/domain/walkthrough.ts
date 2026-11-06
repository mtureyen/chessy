import { z } from 'zod'

/** A key moment of a reviewed game: what the review knows of it, and all the coach goes on. */
export interface WalkthroughMoment {
  ply: number
  /** The move as written in a game, e.g. "12... Qxb7". */
  move: string
  color: 'white' | 'black'
  verdict: string
  /** The mover's winning chances (%) before and after it. */
  winBefore: number
  winAfter: number
  better?: { move: string; line: string }
  /** What really followed in the game; absent when the game ended with this move. */
  played?: string
  /** The engine's best answer to the move: what could have followed, not what did. */
  bestReply?: string
  hanging?: { piece: string; square: string; pawns: number }
  /** How likely a player of the mover's rating was to play it (%). */
  playedBy?: number
}

/** What a walkthrough of a game is written from. */
export interface WalkthroughFacts {
  /** The colour the player had, if they played the game. */
  side?: 'white' | 'black'
  rating?: number
  accuracy: { white?: number; black?: number }
  /** The player's accuracy per phase. */
  phases?: Partial<Record<'opening' | 'middlegame' | 'endgame', number>>
  opening?: {
    name: string
    /** The player's results with this colour in the opening family `of`, over all their games. */
    record?: { of: string; games: number; wins: number; draws: number; losses: number }
  }
  moments: WalkthroughMoment[]
}

/** The coach's words for a game. `better` holds what `what` must not give away. */
export interface Walkthrough {
  summary: string
  opening?: string
  moments: { ply: number; what: string; better?: string }[]
  focus: string
}

/** The same for every game, so providers can cache it; the facts go with each request. */
export const WALKTHROUGH_PROMPT = `You are Chessy's chess coach. You walk a player through a game they finished, from the review's facts.

Rules:
- Use only the facts given. Never calculate variations, never guess an evaluation, never invent moves. If the facts don't tell why, stay general instead of making something up.
- "played" is what really happened after a moment; without it the game ended there. "bestReply" and "better.line" are engine lines that did NOT happen: say what "could" have followed, and never write that a move from them was played, unless "played" has it too.
- A record is for the opening family it names ("of"), not for a narrower line: name that family when you use it.
- Plain words for the player's rating: threats, undefended pieces, plans. No engine numbers, no percentages unless they tell a story.
- Moves in standard algebraic notation. Address the player as "you"; when a moment is the opponent's, say so.

Answer with one JSON object and nothing else:
{
  "summary": "two or three sentences on how the game went and what decided it",
  "opening": "one or two sentences on the opening and how it went, using their record if given; leave this field out when no opening is given",
  "moments": [{ "ply": <the moment's ply>, "what": "...", "better": "..." }],
  "focus": "the one thing to work on after this game, in one sentence"
}

One entry per moment given, same plies. "what": two or three sentences on what the move did and what it allowed. It must NOT name or hint at the better move: the player gets to look for it first. "better": one or two sentences on the better move and the idea behind it; leave it out when no better move is given.`

/** A move the player tried instead of the one they played, and found not good enough. */
export interface TriedMove {
  /** The position they are trying in (FEN). */
  fen: string
  tried: string
  /** The move they played in the game there. */
  played: string
  verdict: string
  /** Their winning chances (%) with the best move, and with this one. */
  winBefore: number
  winAfter: number
  /** The engine's best answer to the try, in SAN. */
  bestReply?: string
  hanging?: { piece: string; square: string; pawns: number }
  rating?: number
}

/** While the player still looks for the better move: nothing here may give it away. */
export const TRY_PROMPT = `You are Chessy's chess coach. The player is back at a moment of a finished game, looking for a better move than the one they played. They just tried a move that isn't good enough.

Rules:
- One or two short sentences on what is wrong with the move they tried, for their rating, addressed to them as "you".
- Never name or hint at the better move, and name no other move of theirs: they are still looking for it.
- Use only the facts given. "bestReply" is what the opponent could answer: say "could". Never calculate variations, never guess an evaluation.
- No engine numbers, no greeting.`

/** A try as the model reads it. */
export function triedText(move: TriedMove): string {
  return `I tried this instead:\n${JSON.stringify(move, null, 1)}`
}

/** The facts as the model reads them. */
export function walkthroughText(facts: WalkthroughFacts): string {
  return `The review of my game:\n${JSON.stringify(facts, null, 1)}`
}

const Reply = z.object({
  summary: z.string().min(1),
  opening: z.string().min(1).optional(),
  moments: z.array(
    z.object({
      ply: z.number().int(),
      what: z.string().min(1),
      better: z.string().min(1).optional(),
    }),
  ),
  focus: z.string().min(1),
})

/**
 * The model's reply, checked: JSON of the right shape with a text for every moment given, in
 * their order; anything else it made up is dropped. Undefined when it can't be used.
 */
export function parseWalkthrough(text: string, facts: WalkthroughFacts): Walkthrough | undefined {
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
  const { summary, opening, moments, focus } = parsed.data
  const written = facts.moments.map((fact) => {
    const moment = moments.find((m) => m.ply === fact.ply)
    if (!moment) return undefined
    const { ply, what, better } = moment
    return { ply, what, ...(fact.better && better && { better }) }
  })
  if (written.some((moment) => !moment)) return undefined
  return {
    summary,
    ...(facts.opening && opening && { opening }),
    moments: written as Walkthrough['moments'],
    focus,
  }
}
