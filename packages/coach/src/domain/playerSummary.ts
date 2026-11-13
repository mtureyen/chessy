import { z } from 'zod'
import { jsonIn } from './openingGuide'

/** Games, wins, draws and losses; the score in percent (a draw is half a point). */
export interface SummaryTally {
  games: number
  wins: number
  draws: number
  losses: number
  score?: number
}

/** Errors in the user's reviewed games, on average per game. */
export interface SummaryErrors {
  blunders: number
  mistakes: number
  misses: number
  inaccuracies: number
}

/**
 * How well the user moved, from pawnia's own reviews of their games. Only ever for the user's
 * own games: other players' games are not reviewed here.
 */
export interface SummaryMoveQuality {
  /** How many of the games have a review; only these count below. */
  reviewedGames: number
  /** The user's mean accuracy (0-100) over those games. */
  averageAccuracy?: number
  perGame: SummaryErrors
  /** The same per phase of the game, with how many of the user's moves fell into it. */
  phases: Record<'opening' | 'middlegame' | 'endgame', SummaryErrors & { moves: number }>
}

/** What both kinds of summary are written from: numbers to quote, no games. */
interface CommonFacts {
  /** The player's name as the page shows it. */
  name: string
  /** Which games count: how many, of which speed, and (for a lookup) since when. */
  window: { games: number; speed?: string; since?: string }
  record: SummaryTally
  /** The rating at the start and at the end of the window, per platform and speed. */
  ratings: { series: string; start: number; end: number; games: number }[]
  /** Opening families with at least MIN_OPENING_GAMES games, most played first. */
  openings: {
    white: (SummaryTally & { name: string })[]
    black: (SummaryTally & { name: string })[]
  }
  firstMoves: {
    /** White's first move, with its share of the White games. */
    asWhite: (SummaryTally & { move: string; share: number })[]
    /** Black's most played answer to White's most common first moves. */
    asBlack: {
      against: string
      reply: string
      opening?: string
      games: number
      /** Games against that first move. */
      of: number
      score?: number
    }[]
  }
  /** How the games ended, by result. */
  endings: {
    wins: { how: string; games: number }[]
    losses: { how: string; games: number }[]
    draws: { how: string; games: number }[]
    averageMoves?: number
  }
  /** Results against stronger, similar and weaker opponents. */
  opponents: (SummaryTally & { group: string })[]
  /** Results by time of day, in the player's time zone. */
  timeOfDay: { timeZone: string; parts: (SummaryTally & { part: string })[] }
}

/**
 * A summary's facts. The user's own games may carry move quality; a looked-up player's never
 * do: their games are not reviewed here, and a platform's own analysis must not be used.
 */
export type PlayerSummaryFacts =
  | (CommonFacts & { kind: 'own'; moveQuality?: SummaryMoveQuality })
  | (CommonFacts & { kind: 'opponent'; platform: string; moveQuality?: never })

/** An opening family counts with this many games: fewer say nothing about it. */
export const MIN_OPENING_GAMES = 3

/** A summary as the coach writes it, both parts in Markdown. */
export interface PlayerSummary {
  /** How the player plays. */
  summary: string
  /** Own stats: the one thing to work on first. A looked-up player: how to meet them. */
  focus: string
}

const SHARED_RULES = `Rules:
- Every number, opening and move comes only from the facts given. Never invent games, opponents, players, events or numbers; if the facts don't show something, don't claim it.
- Openings are listed only with at least ${MIN_OPENING_GAMES} games. Small numbers are noise: with fewer than 5 games, say it is too few to tell instead of drawing a conclusion.
- "score" is points per game in percent (a draw counts half). "ratings" give the rating at the start and the end of these games.
- Plain words for a club player around 800 rating: no jargon without a word of explanation, no engine numbers. Quote a few numbers where they make the point, not all of them.
- Moves in standard algebraic notation with move numbers ("1.e4", "1...c5").
- Markdown sparingly: short paragraphs, a few bullet points where they help, no headings.
- English. Short: the whole answer reads in a minute.`

/** For the user's own games: how they play, and the one thing to work on first. */
export const OWN_SUMMARY_PROMPT = `You are pawnia's chess coach. You read the statistics of the user's own recent games and tell them, as their coach, what the numbers say about how they play and what to work on first. Speak to the user as "you".

${SHARED_RULES}
- "moveQuality" comes from pawnia's reviews of the user's games: errors per game, overall and by phase (opening, middlegame, endgame). Where it is missing, no game was reviewed: say nothing about move quality, and you may suggest reviewing a few games.
- Pick exactly one focus: the thing that would win the most points soonest, and say which numbers show it. Make it something to do: what to practise and how (for example in pawnia: review your games, train on puzzles from your own mistakes, study an opening in the opening library, play the bots).

Answer with one JSON object and nothing else:
{
  "summary": "how you play, from the numbers: results and rating, openings, how your games end, opponents, time of day, move quality where given; two or three short paragraphs",
  "focus": "the one thing to work on first: what it is, which numbers show it, and how to practise it; two to four sentences"
}`

/** For someone else's games: how they play, and how to meet them. */
export const OPPONENT_SUMMARY_PROMPT = `You are pawnia's chess coach. The user is preparing to play the player in the facts. You read that player's statistics and tell the user how this opponent plays and how to meet them. Call the opponent by their name or "they", and the user "you".

${SHARED_RULES}
- These games were not reviewed: there is nothing about how well the moves were played. Never claim anything about the opponent's tactics, blunders, mistakes, accuracy, calculation or move quality, not even as a guess. Talk only about openings, first moves, results, rating, how games end, opponents and time of day.
- Their record against stronger or weaker players, and how their games end (on time, by resignation), are fair to read; what they say about their moves is not.

Answer with one JSON object and nothing else:
{
  "summary": "how they play, from the numbers: results and rating, the openings and first moves they choose, how their games end, against which opponents and at what time of day they do well or badly; two or three short paragraphs",
  "focus": "how to meet them: what to prepare against their openings and first moves, and a plan for the game where the numbers show one (for example their losses on time); two to four sentences or three short bullets"
}`

/** The prompt for these facts: the same per kind, so providers can cache it. */
export function playerSummaryPrompt(facts: PlayerSummaryFacts): string {
  return facts.kind === 'own' ? OWN_SUMMARY_PROMPT : OPPONENT_SUMMARY_PROMPT
}

/** The facts as the model reads them. */
export function playerSummaryText(facts: PlayerSummaryFacts): string {
  return JSON.stringify(facts)
}

const Reply = z.object({ summary: z.string().trim().min(1), focus: z.string().trim().min(1) })

/** The summary from the model's reply, also with text around it; undefined unless complete. */
export function parsePlayerSummary(text: string): PlayerSummary | undefined {
  const parsed = Reply.safeParse(jsonIn(text))
  return parsed.success ? { summary: parsed.data.summary, focus: parsed.data.focus } : undefined
}
