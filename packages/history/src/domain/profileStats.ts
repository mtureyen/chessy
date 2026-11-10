import type { Color } from '@pawnia/chess'
import type { GameCategory, GameSpeed } from '@pawnia/library'
import type { EndReason, GameFacts } from './gameFacts'
import type { PlayerGame, PlayerOutcome } from './playerGames'
import { groupGames, openingFamily, tally, type Group, type Tally } from './stats'

/** A game seen from the player's side, with what its moves tell (absent if they couldn't be read). */
export interface StatsGame extends PlayerGame {
  facts?: GameFacts
}

// ---------------------------------------------------------------------------------------------
// Openings

export interface OpeningStats {
  /** The opening's family, e.g. "Sicilian Defense". */
  family: string
  tally: Tally
  /** The full names within the family, the most played first. */
  variations: { name: string; tally: Tally }[]
}

const UNKNOWN_OPENING = 'Unknown opening'

/** The openings played with one colour by family, the most played first. */
export function openingsAs(games: readonly StatsGame[], color: Color): OpeningStats[] {
  const families = new Map<string, Map<string, StatsGame[]>>()
  for (const game of games) {
    if (game.side !== color) continue
    const name = openingName(game)
    const family = name === UNKNOWN_OPENING ? name : openingFamily(name)
    const variations = families.get(family) ?? new Map<string, StatsGame[]>()
    variations.set(name, [...(variations.get(name) ?? []), game])
    families.set(family, variations)
  }
  return [...families]
    .map(([family, variations]) => ({
      family,
      tally: tally([...variations.values()].flat()),
      variations: byGames(
        [...variations].map(([name, members]) => ({ name, tally: tally(members) })),
        (v) => v.name,
      ),
    }))
    .sort((a, b) => order(a.family, b.family, a.tally, b.tally))
}

function openingName({ game }: StatsGame): string {
  const name = game.opening?.name?.trim()
  // chess.com named no opening "Undefined" in games imported earlier.
  return name && name !== 'Undefined' ? name : UNKNOWN_OPENING
}

// ---------------------------------------------------------------------------------------------
// Repertoire

/** A move in the repertoire tree, with how the games that went through it ended. */
export interface RepertoireNode {
  /** The move in SAN; absent at the root (the start position). */
  san?: string
  /** 1-based half-move number of `san`; 0 at the root. */
  ply: number
  tally: Tally
  /** The most played opening family among these games. */
  opening?: string
  children: RepertoireNode[]
}

/** How deep the tree goes, in half-moves. */
export const REPERTOIRE_PLIES = 6
/** The most moves kept at each position, the most played first. */
const REPERTOIRE_BRANCHES = 4
/** A move needs this many games to show (one game is no repertoire). */
const REPERTOIRE_MIN_GAMES = 2

/**
 * The player's games with one colour as a tree of moves: what they play, what they meet and how
 * they answer, a few moves deep. Rare moves are left out (they still count higher up).
 */
export function repertoire(games: readonly StatsGame[], color: Color): RepertoireNode {
  const own = games.filter((game) => game.side === color && game.facts)
  return node(own, undefined, 0)
}

function node(games: readonly StatsGame[], san: string | undefined, ply: number): RepertoireNode {
  const opening = mostCommon(
    games
      .map(openingName)
      .filter((name) => name !== UNKNOWN_OPENING)
      .map(openingFamily),
  )
  const next = new Map<string, StatsGame[]>()
  if (ply < REPERTOIRE_PLIES) {
    for (const game of games) {
      const move = game.facts?.moves[ply]
      if (move) next.set(move, [...(next.get(move) ?? []), game])
    }
  }
  const children = [...next]
    .filter(([, members]) => members.length >= REPERTOIRE_MIN_GAMES)
    .sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
    .slice(0, REPERTOIRE_BRANCHES)
    .map(([move, members]) => node(members, move, ply + 1))
  return {
    ...(san !== undefined && { san }),
    ply,
    tally: tally(games),
    ...(opening && { opening }),
    children,
  }
}

/** A line of the repertoire from the start: every node of the tree but the root, depth first. */
export interface RepertoireLine {
  moves: string[]
  tally: Tally
  opening?: string
}

export function repertoireLines(root: RepertoireNode): RepertoireLine[] {
  const lines: RepertoireLine[] = []
  const walk = (node: RepertoireNode, moves: string[]) => {
    for (const child of node.children) {
      const line = [...moves, child.san!]
      lines.push({
        moves: line,
        tally: child.tally,
        ...(child.opening && { opening: child.opening }),
      })
      walk(child, line)
    }
  }
  walk(root, [])
  return lines
}

// ---------------------------------------------------------------------------------------------
// How games end

export interface EndingCount {
  reason: EndReason
  games: number
}

export interface Endings {
  wins: EndingCount[]
  draws: EndingCount[]
  losses: EndingCount[]
  /** Mean length in full moves of the games whose moves could be read. */
  averageMoves?: number
}

/** How the games were won, drawn and lost, the most frequent reason first. */
export function endings(games: readonly StatsGame[]): Endings {
  const count = (outcome: PlayerOutcome) => {
    const reasons = new Map<EndReason, number>()
    for (const game of games) {
      if (game.outcome !== outcome) continue
      const reason = game.facts?.end ?? 'other'
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
    }
    return [...reasons]
      .map(([reason, n]) => ({ reason, games: n }))
      .sort((a, b) => b.games - a.games || a.reason.localeCompare(b.reason))
  }
  const lengths = games.flatMap((g) => (g.facts ? [Math.ceil(g.facts.plies / 2)] : []))
  return {
    wins: count('win'),
    draws: count('draw'),
    losses: count('loss'),
    ...(lengths.length > 0 && {
      averageMoves: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
    }),
  }
}

// ---------------------------------------------------------------------------------------------
// When they play

export type DayPart = 'night' | 'morning' | 'afternoon' | 'evening'
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface Activity {
  /** The IANA time zone the hours and days are in (the viewer's). */
  timeZone: string
  /** Night 0–6, morning 6–12, afternoon 12–18, evening 18–24; parts without games left out. */
  dayParts: { key: DayPart; tally: Tally }[]
  /** Monday first; days without games left out. */
  weekdays: { key: Weekday; tally: Tally }[]
}

const DAY_PARTS: readonly DayPart[] = ['night', 'morning', 'afternoon', 'evening']
const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** Results by time of day and weekday, in the given time zone. Throws RangeError for an unknown zone. */
export function activity(games: readonly StatsGame[], timeZone: string): Activity {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  })
  const parts = new Map<DayPart, StatsGame[]>()
  const days = new Map<Weekday, StatsGame[]>()
  for (const game of games) {
    const fields = format.formatToParts(new Date(game.game.playedAt))
    const hour = Number(fields.find((f) => f.type === 'hour')?.value)
    const day = fields
      .find((f) => f.type === 'weekday')
      ?.value.toLowerCase()
      .slice(0, 3)
    const part = DAY_PARTS[Math.floor(hour / 6)]
    if (part) parts.set(part, [...(parts.get(part) ?? []), game])
    if (day && (WEEKDAYS as readonly string[]).includes(day)) {
      days.set(day as Weekday, [...(days.get(day as Weekday) ?? []), game])
    }
  }
  return {
    timeZone,
    dayParts: DAY_PARTS.flatMap((key) => {
      const members = parts.get(key)
      return members ? [{ key, tally: tally(members) }] : []
    }),
    weekdays: WEEKDAYS.flatMap((key) => {
      const members = days.get(key)
      return members ? [{ key, tally: tally(members) }] : []
    }),
  }
}

/** Whether a time zone is one Intl knows. */
export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------------------------
// Rating over time

export interface RatingSeries {
  category: GameCategory
  speed: GameSpeed
  /** The player's rating in each rated game, oldest first. */
  points: { at: string; rating: number }[]
}

/** The player's rating in each rated game, per platform and speed; the longest series first. */
export function ratingHistory(games: readonly StatsGame[]): RatingSeries[] {
  const series = new Map<string, RatingSeries>()
  for (const game of games) {
    if (game.rating === undefined || !game.game.rated) continue
    const key = `${game.category} ${game.game.speed}`
    const entry = series.get(key) ?? { category: game.category, speed: game.game.speed, points: [] }
    entry.points.push({ at: game.game.playedAt, rating: game.rating })
    series.set(key, entry)
  }
  return [...series.values()]
    .map((s) => ({ ...s, points: s.points.sort((a, b) => a.at.localeCompare(b.at)) }))
    .sort((a, b) => b.points.length - a.points.length)
}

// ---------------------------------------------------------------------------------------------
// All of it

/** One game in the list behind the numbers. */
export interface StatsGameRow {
  id: string
  url?: string
  playedAt: string
  speed: GameSpeed
  side: Color
  outcome: PlayerOutcome
  opponent: { name: string; rating?: number }
  opening?: string
  end?: EndReason
  /** Length in full moves. */
  moves?: number
}

export interface ProfileStats {
  record: Tally
  ratings: RatingSeries[]
  openings: { white: OpeningStats[]; black: OpeningStats[] }
  repertoire: { white: RepertoireNode; black: RepertoireNode }
  endings: Endings
  /** Results against stronger, similar and weaker opponents. */
  opponents: Group[]
  activity: Activity
  /** The games counted, newest first. */
  games: StatsGameRow[]
}

/** Everything the stats page shows about a set of games, from the player's side. */
export function profileStats(games: readonly StatsGame[], timeZone: string): ProfileStats {
  return {
    record: tally(games),
    ratings: ratingHistory(games),
    openings: { white: openingsAs(games, 'white'), black: openingsAs(games, 'black') },
    repertoire: { white: repertoire(games, 'white'), black: repertoire(games, 'black') },
    endings: endings(games),
    opponents: groupGames(games, 'opponent_strength'),
    activity: activity(games, timeZone),
    games: games.map(gameRow),
  }
}

function gameRow(game: StatsGame): StatsGameRow {
  const name = openingName(game)
  return {
    id: game.game.id,
    ...(game.game.url && { url: game.game.url }),
    playedAt: game.game.playedAt,
    speed: game.game.speed,
    side: game.side,
    outcome: game.outcome,
    opponent: game.opponent,
    ...(name !== UNKNOWN_OPENING && { opening: name }),
    ...(game.facts && { end: game.facts.end, moves: Math.ceil(game.facts.plies / 2) }),
  }
}

// ---------------------------------------------------------------------------------------------

function mostCommon(values: readonly string[]): string | undefined {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: string | undefined
  for (const [value, n] of counts) if (best === undefined || n > counts.get(best)!) best = value
  return best
}

function order(a: string, b: string, x: Tally, y: Tally): number {
  return y.games - x.games || a.localeCompare(b)
}

function byGames<T extends { tally: Tally }>(items: T[], name: (item: T) => string): T[] {
  return items.sort((a, b) => order(name(a), name(b), a.tally, b.tally))
}
