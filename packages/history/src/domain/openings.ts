import type { GameReview, OpeningBook } from '@pawnia/analysis'
import { createGame, importPgn, type Color } from '@pawnia/chess'
import type { PlayerGame } from './playerGames'
import { openingFamily, tally, type Tally } from './stats'

/** Half-moves a game's opening is looked at: the first 12 moves of each side. */
export const OPENING_PLIES = 24

/** A move of a game's opening, and whether theory (the book) knows the position after it. */
export interface OpeningMove {
  san: string
  uci: string
  book: boolean
}

/** Where a game left theory: the first move after which the book doesn't know the position. */
export interface Departure {
  /** 1-based half-move. */
  ply: number
  san: string
  /** The moves theory had there instead (SAN), the ones the book continues with. */
  theory: string[]
}

/** A game's first moves through the book. */
export interface OpeningPath {
  moves: OpeningMove[]
  /** Absent when the game stayed in theory as far as the book goes (or as it is looked at). */
  departure?: Departure
}

/** The first moves of a game and where it left theory; undefined when the PGN can't be read. */
export function openingPath(pgn: string, book: OpeningBook): OpeningPath | undefined {
  let line
  try {
    line = importPgn(pgn).game.line()
  } catch {
    return undefined
  }
  const moves: OpeningMove[] = []
  let departure: Departure | undefined
  let before = createGame().fen()
  for (const node of line.slice(0, OPENING_PLIES)) {
    if (!node.move) break
    const known = book.isBook(node.fen)
    moves.push({ san: node.move.san, uci: node.move.uci, book: known })
    if (!known && !departure && book.isBook(before)) {
      const theory = theoryMoves(before, book)
      // Where the book has no move on, it simply ends there: nobody left theory.
      if (theory.length > 0) departure = { ply: node.ply, san: node.move.san, theory }
    }
    before = node.fen
  }
  return { moves, ...(departure && { departure }) }
}

/** A move theory knows from a position. */
export interface TheoryMove {
  san: string
  uci: string
}

/** The moves from a position that theory goes on with, in move-generation order. */
export function theoryChoices(fen: string, book: OpeningBook): TheoryMove[] {
  return createGame(fen)
    .legalMoves()
    .flatMap((move) => {
      const node = createGame(fen).play(move)
      return node?.move && book.isBook(node.fen) ? [{ san: node.move.san, uci: node.move.uci }] : []
    })
}

/** The same, as SAN. */
export function theoryMoves(fen: string, book: OpeningBook): string[] {
  return theoryChoices(fen, book).map((move) => move.san)
}

/**
 * How a practised move counts, once it isn't theory: as good as the engine's choice, playable
 * (the review calls it good), or wrong.
 */
export type PracticeVerdict = 'theory' | 'good' | 'playable' | 'wrong'

export function practiceVerdict(classification: string): Exclude<PracticeVerdict, 'theory'> {
  if (['brilliant', 'great', 'best', 'excellent', 'book'].includes(classification)) return 'good'
  return classification === 'good' ? 'playable' : 'wrong'
}

/** A game seen from the player's side, with its way through the opening (if readable). */
export interface OpeningGame extends PlayerGame {
  path?: OpeningPath
}

/** Who left theory first, as the player sees it. */
export type LeftBy = 'you' | 'them'

function leftBy(game: OpeningGame): LeftBy | undefined {
  const ply = game.path?.departure?.ply
  if (ply === undefined) return undefined
  const whiteMoved = ply % 2 === 1
  return whiteMoved === (game.side === 'white') ? 'you' : 'them'
}

const UNKNOWN = 'Unknown opening'

function familyOf({ game }: OpeningGame): string {
  const name = game.opening?.name?.trim()
  return name && name !== 'Undefined' ? openingFamily(name) : UNKNOWN
}

// ---------------------------------------------------------------------------------------------
// Overview

/** Openings with at least this many games come first, worst first; one game says nothing. */
const MIN_GAMES = 3
const MIN_LISTED = 2

export interface Departures {
  /** Games where the player left theory first. */
  you: number
  /** Games where the opponent did. */
  them: number
  /** Games that stayed in theory as far as the book goes. */
  none: number
  /** The median move (full-move number) at which the player left theory, when they did. */
  youAt?: number
}

export interface OpeningOverview {
  color: Color
  family: string
  tally: Tally
  departures: Departures
}

/**
 * The player's openings per colour, worst first among those with enough games to say something
 * (by score, then the most played); openings played once are left out.
 */
export function openingOverview(games: readonly OpeningGame[]): OpeningOverview[] {
  const groups = new Map<string, OpeningGame[]>()
  for (const game of games) {
    const family = familyOf(game)
    if (family === UNKNOWN) continue
    const key = `${game.side}\n${family}`
    groups.set(key, [...(groups.get(key) ?? []), game])
  }
  const rank = (o: OpeningOverview) => (o.tally.games >= MIN_GAMES ? 0 : 1)
  return [...groups]
    .filter(([, members]) => members.length >= MIN_LISTED)
    .map(([key, members]) => {
      const [color, family] = key.split('\n') as [Color, string]
      return { color, family, tally: tally(members), departures: departures(members) }
    })
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.tally.score ?? 0) - (b.tally.score ?? 0) ||
        b.tally.games - a.tally.games ||
        a.family.localeCompare(b.family),
    )
}

function departures(games: readonly OpeningGame[]): Departures {
  const by = games.map(leftBy)
  const yours = games
    .filter((_, i) => by[i] === 'you')
    .map((g) => Math.ceil(g.path!.departure!.ply / 2))
    .sort((a, b) => a - b)
  return {
    you: yours.length,
    them: by.filter((b) => b === 'them').length,
    none: by.filter((b) => b === undefined).length,
    ...(yours.length > 0 && { youAt: yours[Math.floor((yours.length - 1) / 2)] }),
  }
}

// ---------------------------------------------------------------------------------------------
// One opening

/** A move in the player's lines of one opening, from the start. */
export interface OpeningLine {
  moves: string[]
  tally: Tally
  /** Theory knows the position after it. */
  book: boolean
  /** The player made this move (else the opponent). */
  yours: boolean
  /** When this move left theory: what theory had instead. */
  theory?: string[]
}

/** A game of the opening, with where it left theory. */
export interface OpeningGameRow {
  id: string
  url?: string
  playedAt: string
  outcome: PlayerGame['outcome']
  opponent: { name: string; rating?: number }
  left?: Departure & { by: LeftBy }
}

export interface OpeningDetail {
  color: Color
  family: string
  tally: Tally
  departures: Departures
  lines: OpeningLine[]
  games: OpeningGameRow[]
}

/** The deepest a line goes on the page (moves past it are in the games). */
const LINE_PLIES = 16

/**
 * One opening with one colour: the lines the player's games took (moves played twice or more, and
 * every move up to where the player left theory, so each of their departures shows), results per
 * line, and the games. Undefined when the player has no such games.
 */
export function openingDetail(
  games: readonly OpeningGame[],
  color: Color,
  family: string,
): OpeningDetail | undefined {
  const members = games.filter((g) => g.side === color && familyOf(g) === family)
  if (members.length === 0) return undefined
  return {
    color,
    family,
    tally: tally(members),
    departures: departures(members),
    lines: openingLines(members, color),
    games: members.map((game) => {
      const by = leftBy(game)
      return {
        id: game.game.id,
        ...(game.game.url && { url: game.game.url }),
        playedAt: game.game.playedAt,
        outcome: game.outcome,
        opponent: game.opponent,
        ...(by && { left: { ...game.path!.departure!, by } }),
      }
    }),
  }
}

function openingLines(games: readonly OpeningGame[], color: Color): OpeningLine[] {
  const lines: OpeningLine[] = []
  const walk = (members: readonly OpeningGame[], moves: string[]) => {
    const ply = moves.length
    if (ply >= LINE_PLIES) return
    const next = new Map<string, OpeningGame[]>()
    for (const game of members) {
      const move = game.path?.moves[ply]
      if (move) next.set(move.san, [...(next.get(move.san) ?? []), game])
    }
    // A move one game played shows only on the way to where the player left theory in it: what
    // a single opponent tried once is in the games, not worth a branch.
    const children = [...next]
      .filter(([, group]) => group.length >= 2 || group.some((g) => youDepartAtOrAfter(g, ply + 1)))
      .sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
    for (const [san, group] of children) {
      const move = group[0]!.path!.moves[ply]!
      const departure = group[0]!.path!.departure
      const left = departure?.ply === ply + 1 ? departure : undefined
      lines.push({
        moves: [...moves, san],
        tally: tally(group),
        book: move.book,
        yours: (ply % 2 === 0) === (color === 'white'),
        ...(left && { theory: left.theory }),
      })
      walk(group, [...moves, san])
    }
  }
  walk(games, [])
  return lines
}

/** The player left theory in this game at this half-move or later. */
function youDepartAtOrAfter(game: OpeningGame, ply: number): boolean {
  const left = game.path?.departure?.ply
  return left !== undefined && left >= ply && leftBy(game) === 'you'
}

// ---------------------------------------------------------------------------------------------
// After the opening, from reviews

/** The end of the opening for these numbers: after each side's 12th move. */
const AFTER_PLY = OPENING_PLIES
/** The opening's errors: the player's moves in the first ten moves of each side. */
const OPENING_ERROR_PLIES = 20
const ERRORS = new Set(['inaccuracy', 'mistake', 'miss', 'blunder'])

export interface AfterOpening {
  reviewedGames: number
  /** The player's mean winning chance (0–100) after move 12, where the game got that far. */
  win?: number
  /** The player's inaccuracies, mistakes, misses and blunders in the first 10 moves, per game. */
  errorsPerGame: number
}

/** How the player came out of the opening in the reviewed games among these. */
export function afterOpening(
  reviews: readonly { side: Color; review: GameReview }[],
): AfterOpening {
  const wins = reviews.flatMap(({ side, review }) => {
    const white = review.positions[AFTER_PLY]?.whiteWin
    return white === undefined ? [] : [side === 'white' ? white : 100 - white]
  })
  const errors = reviews.reduce(
    (sum, { side, review }) =>
      sum +
      review.moves.filter(
        (m) => m.color === side && m.ply <= OPENING_ERROR_PLIES && ERRORS.has(m.classification),
      ).length,
    0,
  )
  return {
    reviewedGames: reviews.length,
    ...(wins.length > 0 && { win: Math.round(wins.reduce((a, b) => a + b, 0) / wins.length) }),
    errorsPerGame: reviews.length > 0 ? Math.round((errors / reviews.length) * 10) / 10 : 0,
  }
}
