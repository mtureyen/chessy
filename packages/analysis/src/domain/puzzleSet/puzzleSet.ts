import { createGame, type Color } from '@pawnia/chess'

/**
 * The puzzle set: a local selection of lichess' puzzle database (database.lichess.org/#puzzles,
 * CC0), handed out by theme and difficulty.
 */

/** A puzzle as lichess publishes it. */
export interface Puzzle {
  /** lichess' id: the puzzle is at lichess.org/training/<id>. */
  id: string
  /** The position before the opponent's move that sets the puzzle up. */
  fen: string
  /** UCI. The first move is the opponent's; the solution starts with the second. */
  moves: string[]
  rating: number
  /** lichess' theme keys, e.g. "fork", "mateIn2", "endgame". */
  themes: string[]
}

/** A row of the database: a puzzle with what tells how far its rating can be trusted. */
export interface PuzzleRow extends Puzzle {
  ratingDeviation: number
  /** −100 to 100: how the players who voted liked it. */
  popularity: number
  plays: number
}

/** The database's header, as far as rows are read: a file that starts differently isn't one. */
export const PUZZLE_COLUMNS = 'PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes'

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/
const whole = (text: string | undefined) =>
  text !== undefined && /^-?\d+$/.test(text) ? Number(text) : undefined

/**
 * Reads one line of the database (no field of it holds a comma or a quote). Undefined for
 * anything that isn't a puzzle: the header, an empty line, a line cut off or damaged.
 */
export function parsePuzzleRow(line: string): PuzzleRow | undefined {
  const [id, fen, moveList, ratingText, deviationText, popularityText, playsText, themeList] = line
    .trim()
    .split(',')
  const rating = whole(ratingText)
  const ratingDeviation = whole(deviationText)
  const popularity = whole(popularityText)
  const plays = whole(playsText)
  if (!id || !/^\w+$/.test(id) || !fen || moveList === undefined || themeList === undefined) {
    return undefined
  }
  if (
    rating === undefined ||
    ratingDeviation === undefined ||
    popularity === undefined ||
    plays === undefined
  ) {
    return undefined
  }
  const moves = moveList.split(' ')
  // The opponent's move and at least one of the solver's.
  if (moves.length < 2 || !moves.every((move) => UCI_MOVE.test(move))) return undefined
  const themes = themeList.split(' ').filter(Boolean)
  return { id, fen, moves, rating, ratingDeviation, popularity, plays, themes }
}

/** Which puzzles are good enough to keep. */
export interface PuzzleFilter {
  minPopularity: number
  minPlays: number
  maxRatingDeviation: number
  /** Puzzles rated this or higher are left out. */
  ratingBelow: number
}

/**
 * Well liked, and played often enough that the rating has settled (a puzzle's rating is as
 * uncertain as a new player's until then). From 2200 up the puzzles are for few players.
 */
export const PUZZLE_FILTER: PuzzleFilter = {
  minPopularity: 85,
  minPlays: 500,
  maxRatingDeviation: 90,
  ratingBelow: 2200,
}

export function isGoodPuzzle(row: PuzzleRow, filter: PuzzleFilter = PUZZLE_FILTER): boolean {
  return (
    row.popularity >= filter.minPopularity &&
    row.plays >= filter.minPlays &&
    row.ratingDeviation <= filter.maxRatingDeviation &&
    row.rating < filter.ratingBelow
  )
}

/** How many puzzles are kept for one theme in one rating band, and how wide a band is. */
export interface PuzzleCap {
  perThemeBand: number
  bandWidth: number
}

/** Enough that a player doesn't run out of a theme at their level; more only grows the file. */
export const PUZZLE_CAP: PuzzleCap = { perThemeBand: 200, bandWidth: 100 }

/**
 * Thins the puzzles out evenly: common themes at common ratings would fill the file many times
 * over, while a rare mating pattern has a few dozen puzzles in all. A puzzle is kept while one
 * of its themes still has room in its rating band, and then counts for all its themes. So every
 * theme gets up to the cap where there are that many; a common theme ends up with more than
 * the cap, through puzzles kept for a rarer one. First come, first kept: the database is in no
 * order that matters.
 */
export function capPuzzles<P extends Pick<Puzzle, 'rating' | 'themes'>>(
  puzzles: Iterable<P>,
  cap: PuzzleCap = PUZZLE_CAP,
): P[] {
  const kept: P[] = []
  const counts = new Map<string, number>()
  for (const puzzle of puzzles) {
    const band = Math.floor(puzzle.rating / cap.bandWidth)
    const keys = puzzle.themes.map((theme) => `${theme}@${band}`)
    if (!keys.some((key) => (counts.get(key) ?? 0) < cap.perThemeBand)) continue
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
    kept.push(puzzle)
  }
  return kept
}

/**
 * What a theme says about a puzzle: a tactical motif, a mate (by length or by pattern), the
 * phase of the game, the solution's length, what solving it wins, or where the game was played.
 */
export type PuzzleThemeKind = 'motif' | 'mate' | 'phase' | 'length' | 'goal' | 'origin'

/** lichess' themes that aren't motifs; mates are told by their names. */
const THEME_KINDS: Record<string, PuzzleThemeKind> = {
  opening: 'phase',
  middlegame: 'phase',
  endgame: 'phase',
  rookEndgame: 'phase',
  bishopEndgame: 'phase',
  pawnEndgame: 'phase',
  knightEndgame: 'phase',
  queenEndgame: 'phase',
  queenRookEndgame: 'phase',
  oneMove: 'length',
  short: 'length',
  long: 'length',
  veryLong: 'length',
  equality: 'goal',
  advantage: 'goal',
  crushing: 'goal',
  master: 'origin',
  masterVsMaster: 'origin',
  superGM: 'origin',
}

export function puzzleThemeKind(theme: string): PuzzleThemeKind {
  if (theme === 'mate' || /^mateIn\d+$/.test(theme) || theme.endsWith('Mate')) return 'mate'
  return THEME_KINDS[theme] ?? 'motif'
}

export interface PuzzleThemeCount {
  theme: string
  kind: PuzzleThemeKind
  puzzles: number
}

/** The themes the puzzles have with how many puzzles each has, the most first. */
export function puzzleThemes(puzzles: Iterable<Pick<Puzzle, 'themes'>>): PuzzleThemeCount[] {
  const counts = new Map<string, number>()
  for (const { themes } of puzzles) {
    for (const theme of themes) counts.set(theme, (counts.get(theme) ?? 0) + 1)
  }
  return [...counts]
    .map(([theme, count]) => ({ theme, kind: puzzleThemeKind(theme), puzzles: count }))
    .sort((a, b) => b.puzzles - a.puzzles || a.theme.localeCompare(b.theme))
}

/** Which puzzle is wanted next. */
export interface PuzzleWish {
  /** Any of these; none: any puzzle. */
  themes?: readonly string[]
  /** The puzzle's rating should be close to this. */
  rating: number
  /** Ids not to hand out again. */
  exclude?: ReadonlySet<string>
  /** 0 ≤ x < 1, like Math.random. */
  random?: () => number
}

export interface PickedPuzzle {
  puzzle: Puzzle
  /** The wanted theme it was picked for. */
  theme?: string
}

/**
 * How far from the wanted rating a puzzle may be, tried in turn: the narrowest distance that has
 * puzzles left decides. 50 points is about what a solver can't tell apart; a rare theme, or a
 * player who has seen the near ones, gets the next wider ring.
 */
export const PICK_DISTANCES: readonly number[] = [50, 100, 200, 400]

/**
 * Picks the next puzzle. Of several wanted themes one is drawn first, each as likely as the
 * others: otherwise a common theme (a fork) would crowd out a rare one (a skewer) the player
 * needs as much. Then a puzzle of it near the rating, by chance among those in the narrowest of
 * PICK_DISTANCES that has any; past the widest, the ones closest in rating. Undefined when
 * nothing is left: no puzzle of these themes, or every one excluded.
 */
export function pickPuzzle(
  puzzles: readonly Puzzle[],
  { themes = [], rating, exclude, random = Math.random }: PuzzleWish,
): PickedPuzzle | undefined {
  const draw = <T>(from: readonly T[]): T =>
    from[Math.min(from.length - 1, Math.floor(random() * from.length))]!
  const open = exclude ? puzzles.filter((puzzle) => !exclude.has(puzzle.id)) : puzzles

  let theme: string | undefined
  let candidates = open
  const wanted = [...new Set(themes)]
  if (wanted.length > 0) {
    const byTheme = new Map<string, Puzzle[]>(wanted.map((t) => [t, []]))
    for (const puzzle of open) {
      for (const t of puzzle.themes) byTheme.get(t)?.push(puzzle)
    }
    const available = wanted.filter((t) => byTheme.get(t)!.length > 0)
    if (available.length === 0) return undefined
    theme = draw(available)
    candidates = byTheme.get(theme)!
  }
  if (candidates.length === 0) return undefined

  const distance = (puzzle: Puzzle) => Math.abs(puzzle.rating - rating)
  for (const within of PICK_DISTANCES) {
    const near = candidates.filter((puzzle) => distance(puzzle) <= within)
    if (near.length > 0) return { puzzle: draw(near), ...(theme && { theme }) }
  }
  const closest = Math.min(...candidates.map(distance))
  const nearest = candidates.filter((puzzle) => distance(puzzle) === closest)
  return { puzzle: draw(nearest), ...(theme && { theme }) }
}

/** A puzzle as the solver meets it. */
export interface PuzzleStart {
  /** The position to solve: after the opponent's move. */
  fen: string
  /** The move that led to it (UCI), to show where the opponent just went. */
  opponentMove: string
  /** The solver's side. */
  color: Color
  /** UCI, the solver's move first, then the opponent's answer, and so on. */
  solution: string[]
}

/**
 * Plays the opponent's first move. Undefined for a puzzle that can't be played as written: a
 * position that isn't one, or an illegal move anywhere in its line.
 */
export function puzzleStart(puzzle: Pick<Puzzle, 'fen' | 'moves'>): PuzzleStart | undefined {
  const [opponentMove, ...solution] = puzzle.moves
  if (!opponentMove || solution.length === 0) return undefined
  let game
  try {
    game = createGame(puzzle.fen)
  } catch {
    return undefined
  }
  const start = game.play(opponentMove)
  if (!start) return undefined
  const color = game.turn()
  for (const move of solution) {
    if (!game.play(move)) return undefined
  }
  return { fen: start.fen, opponentMove, color, solution }
}

/** A puzzle in the file: id, FEN, moves, rating, themes; moves and themes space-separated. */
export type PackedPuzzle = [id: string, fen: string, moves: string, rating: number, themes: string]

export function packPuzzle({ id, fen, moves, rating, themes }: Puzzle): PackedPuzzle {
  return [id, fen, moves.join(' '), rating, themes.join(' ')]
}

export function unpackPuzzle([id, fen, moves, rating, themes]: PackedPuzzle): Puzzle {
  return { id, fen, moves: moves.split(' '), rating, themes: themes.split(' ').filter(Boolean) }
}

/** Where a puzzle set came from and how it was chosen. */
export interface PuzzleSetSource {
  /** The database file (or a local copy of it). */
  url: string
  license: 'CC0-1.0'
  /** The file's Last-Modified (ISO 8601): lichess publishes a new one every month. */
  lastModified?: string
  /** When the set was made (ISO 8601). */
  fetchedAt: string
  /** How many bytes from the file's start were read; the rows are in no order, so a sample. */
  bytes: number
  /** Puzzles read from those bytes. */
  read: number
  /** Of them, the ones that passed the filter and can be played. */
  good: number
  filter: PuzzleFilter
  cap: PuzzleCap
}

/** The puzzle set's file, written by apps/api/scripts/fetch-puzzles.ts. */
export interface PuzzleSetFile {
  version: 1
  source: PuzzleSetSource
  puzzles: PackedPuzzle[]
}

/** The file's text: JSON with a puzzle per line, so it can be searched and compared by line. */
export function formatPuzzleSet({ puzzles, ...head }: PuzzleSetFile): string {
  const lines = puzzles.map((puzzle) => JSON.stringify(puzzle)).join(',\n')
  return `${JSON.stringify(head).slice(0, -1)},"puzzles":[\n${lines}\n]}\n`
}
