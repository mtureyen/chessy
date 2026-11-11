import { createGame } from '@pawnia/chess'
import { bookKey } from '../review/book'
import type { LibraryEntry } from './startSet'

/** Rating bands of the games counted (the mean of both players' ratings). */
export const BANDS = ['under-1200', '1200-1599', '1600-1999', '2000+'] as const
export type Band = (typeof BANDS)[number]

export function bandOf(whiteElo: number, blackElo: number): Band {
  const mean = (whiteElo + blackElo) / 2
  return mean < 1200
    ? 'under-1200'
    : mean < 1600
      ? '1200-1599'
      : mean < 2000
        ? '1600-1999'
        : '2000+'
}

/** The bands "low to mid" stands for. */
export const LOW_BANDS: readonly Band[] = ['under-1200', '1200-1599']

/** How deep the library goes, in half-moves. */
export const LIBRARY_PLIES = 16

/** A named line of the opening book: lichess' chess-openings rows. */
export interface BookLine {
  eco: string
  name: string
  /** SAN moves, e.g. "e4 c6 d4 d5". */
  moves: string
}

/** The SAN moves of a PGN movetext ("1. e4 c6 2. d4" → ["e4", "c6", "d4"]). */
export function sanMoves(pgn: string): string[] {
  return pgn.split(/\s+/).filter((token) => token && !/^\d+\.+$/.test(token))
}

/** The position keys along a line, the start position first; undefined for an illegal line. */
export function lineKeys(moves: readonly string[]): string[] | undefined {
  const game = createGame()
  const keys = [bookKey(game.fen())]
  for (const san of moves) {
    const node = game.play(san)
    if (!node) return undefined
    keys.push(bookKey(node.fen))
  }
  return keys
}

/**
 * The book's named lines of an opening: the name matches, and the line goes through the opening's
 * main position (in any move order) or leads up to it. Shortest first.
 */
export function entryLines(entry: LibraryEntry, lines: readonly BookLine[]): BookLine[] {
  const mainKeys = lineKeys(entry.main.split(' '))
  if (!mainKeys) throw new Error(`${entry.id}: its main line is illegal`)
  const main = mainKeys.at(-1)!
  const { startsWith = [], contains = [] } = entry.names
  const named = (name: string) =>
    startsWith.some(
      (prefix) =>
        name === prefix || [':', ',', ' '].some((after) => name.startsWith(`${prefix}${after}`)),
    ) || contains.some((part) => name.includes(part))
  const anyOrder = contains.length > 0
  return lines
    .filter((line) => {
      if (!named(line.name)) return false
      const keys = lineKeys(line.moves.split(' '))
      if (!keys) return false
      return anyOrder || keys.includes(main) || mainKeys.includes(keys.at(-1)!)
    })
    .sort(
      (a, b) =>
        a.moves.split(' ').length - b.moves.split(' ').length || a.name.localeCompare(b.name),
    )
}

/** Every position of these lines (up to LIBRARY_PLIES), and of the main lines: what gets counted. */
export function libraryKeys(
  entries: readonly { main: string; lines: readonly BookLine[] }[],
): Set<string> {
  const keys = new Set<string>()
  for (const entry of entries) {
    for (const moves of [entry.main, ...entry.lines.map((l) => l.moves)]) {
      for (const key of lineKeys(moves.split(' ').slice(0, LIBRARY_PLIES)) ?? []) keys.add(key)
    }
  }
  return keys
}

// ---------------------------------------------------------------------------------------------
// Counting real games

/** White wins, draws, Black wins: for each band in BANDS order, 12 numbers. */
export type BandCounts = number[]

/** The moves played from a position, with their results per band. */
export type PositionCounts = Record<string, BandCounts>

const RESULT_INDEX = { '1-0': 0, '1/2-1/2': 1, '0-1': 2 } as const

/**
 * Counts what real games played from the library's positions: per position, per move, per band,
 * the results. With `beyond`, also from positions up to that many half-moves past where a game
 * left the library's lines (where many traps are); those are pruned now and then (`prune`) so
 * rare ones don't pile up. Games are fed one by one (SAN moves, result, both ratings).
 */
export class LibraryCounter {
  readonly positions = new Map<string, PositionCounts>()
  /** Games counted per band (all of them, for shares). */
  readonly games: Record<Band, number> = {
    'under-1200': 0,
    '1200-1599': 0,
    '1600-1999': 0,
    '2000+': 0,
  }
  private readonly keys: ReadonlySet<string>
  private readonly beyond: number

  constructor(keys: ReadonlySet<string>, { beyond = 0 }: { beyond?: number } = {}) {
    this.keys = keys
    this.beyond = beyond
  }

  add(moves: readonly string[], result: string, whiteElo: number, blackElo: number): void {
    const outcome = RESULT_INDEX[result as keyof typeof RESULT_INDEX]
    if (outcome === undefined) return
    const band = bandOf(whiteElo, blackElo)
    this.games[band]++
    const slot = BANDS.indexOf(band) * 3 + outcome
    const game = createGame()
    /** Half-moves since the game was last on a library position. */
    let away = 0
    for (const san of moves.slice(0, LIBRARY_PLIES)) {
      const key = bookKey(game.fen())
      const node = game.play(san)
      if (!node?.move) return
      away = this.keys.has(key) ? 0 : away + 1
      if (away > this.beyond) return
      const counts = this.positions.get(key) ?? {}
      const move = (counts[node.move.san] ??= new Array<number>(12).fill(0))
      move[slot]!++
      this.positions.set(key, counts)
    }
  }

  /** Drops positions past the library's lines with fewer than `min` games: rare ones. */
  prune(min: number): void {
    for (const [key, counts] of this.positions) {
      if (this.keys.has(key)) continue
      let games = 0
      for (const move of Object.values(counts)) for (const n of move) games += n
      if (games < min) this.positions.delete(key)
    }
  }

  /** Whether a position is one of the library's own (not just counted past them). */
  isLibrary(key: string): boolean {
    return this.keys.has(key)
  }
}

/** A position's games in one band: the sum over its moves. */
export function bandTotal(
  counts: PositionCounts | undefined,
  band: Band,
): [number, number, number] {
  const at = BANDS.indexOf(band) * 3
  const sum: [number, number, number] = [0, 0, 0]
  for (const move of Object.values(counts ?? {})) {
    sum[0] += move[at]!
    sum[1] += move[at + 1]!
    sum[2] += move[at + 2]!
  }
  return sum
}

/** Points per game in percent for one side; undefined without games. */
export function scoreFor(
  [white, draws, black]: readonly [number, number, number],
  side: 'white' | 'black',
): number | undefined {
  const games = white + draws + black
  if (games === 0) return undefined
  return Math.round((((side === 'white' ? white : black) + draws / 2) / games) * 100)
}

/** Several bands summed. */
export function bandsTotal(counts: PositionCounts | undefined, bands: readonly Band[]) {
  return bands.reduce<[number, number, number]>(
    (sum, band) => {
      const [w, d, b] = bandTotal(counts, band)
      return [sum[0] + w, sum[1] + d, sum[2] + b]
    },
    [0, 0, 0],
  )
}

/** A move's results summed over several bands. */
export function moveTotal(move: BandCounts, bands: readonly Band[]): [number, number, number] {
  return bands.reduce<[number, number, number]>(
    (sum, band) => {
      const at = BANDS.indexOf(band) * 3
      return [sum[0] + move[at]!, sum[1] + move[at + 1]!, sum[2] + move[at + 2]!]
    },
    [0, 0, 0],
  )
}

// ---------------------------------------------------------------------------------------------
// Tags

export interface OpeningNumbers {
  /** The opening side's score at the main position, per band. */
  score: Partial<Record<Band, number>>
  /** How many of a band's games reach the main position, in per mille. */
  share: Record<Band, number>
}

export function openingNumbers(
  side: 'white' | 'black',
  main: PositionCounts | undefined,
  games: Record<Band, number>,
): OpeningNumbers {
  const score: Partial<Record<Band, number>> = {}
  const share = {} as Record<Band, number>
  for (const band of BANDS) {
    const total = bandTotal(main, band)
    const s = scoreFor(total, side)
    if (s !== undefined) score[band] = s
    const reached = total[0] + total[1] + total[2]
    share[band] = games[band] > 0 ? Math.round((reached / games[band]) * 1000 * 10) / 10 : 0
  }
  return { score, share }
}

export interface OpeningTags {
  /** Scores well under 1600, better than among strong players. */
  lowElo: boolean
  /** Strong players (2000+) play it at least as often as everyone else. */
  strong: boolean
}

/** The opening side scores this well (and this much better than at 2000+) to count as working low. */
const LOW_SCORE = 52
const LOW_GAP = 2
/** Played in at least this many of a thousand 2000+ games to count as strong players' choice. */
const STRONG_SHARE = 2

export function openingTags(
  main: PositionCounts | undefined,
  side: 'white' | 'black',
  games: Record<Band, number>,
): OpeningTags {
  const low = scoreFor(bandsTotal(main, LOW_BANDS), side)
  const high = scoreFor(bandTotal(main, '2000+'), side)
  const { share } = openingNumbers(side, main, games)
  const lowShare = (share['under-1200'] + share['1200-1599']) / 2
  return {
    lowElo: low !== undefined && low >= LOW_SCORE && (high === undefined || low - high >= LOW_GAP),
    strong: share['2000+'] >= STRONG_SHARE && share['2000+'] >= lowShare,
  }
}

// ---------------------------------------------------------------------------------------------
// Traps

/** A trap: in a position, the move most players under 1600 make loses, and it shows in results. */
export interface TrapCandidate {
  /** SAN from the start to the position. */
  moves: string[]
  fen: string
  /** The side that sets the trap (the other one walks into it). */
  trapper: 'white' | 'black'
  /** The move most players under 1600 make here. */
  bait: string
  /** Its share of the moves made here under 1600, in percent. */
  baitShare: number
  /** The trapper's score after it under 1600, in percent. */
  trapperScore: number
  /** Games under 1600 with the bait. */
  games: number
}

/** The bait must be the usual move, often enough, and pay off clearly for the other side. */
const TRAP_SHARE = 25
const TRAP_GAMES = 100
const TRAP_SCORE = 62

/** A move is followed when looking for traps if this many games under 1600 made it. */
const FOLLOW_GAMES = 50

/**
 * Positions where the move most players under 1600 make scores badly for them: candidates the
 * engine then checks (a trap is a bad move by the engine too, not just a bad result). Walks from
 * the start along every move made often enough under 1600, as deep as the counts go.
 */
export function trapCandidates(positions: ReadonlyMap<string, PositionCounts>): TrapCandidate[] {
  const seen = new Set<string>()
  const found: TrapCandidate[] = []
  const walk = (fen: string, path: string[]) => {
    const key = bookKey(fen)
    if (seen.has(key) || path.length > LIBRARY_PLIES) return
    seen.add(key)
    const counts = positions.get(key)
    if (!counts) return
    const toMove = fen.split(' ')[1] === 'w' ? 'white' : 'black'
    const candidate = trapAt(counts, path, fen, toMove)
    if (candidate) found.push(candidate)
    // The most played moves first, so a position is found by its usual move order.
    const next = Object.entries(counts)
      .map(([san, move]) => ({ san, games: moveTotal(move, LOW_BANDS).reduce((a, b) => a + b, 0) }))
      .filter((move) => move.games >= FOLLOW_GAMES)
      .sort((a, b) => b.games - a.games)
    for (const { san } of next) {
      const node = createGame(fen).play(san)
      if (node) walk(node.fen, [...path, san])
    }
  }
  walk(createGame().fen(), [])
  return found
}

function trapAt(
  counts: PositionCounts | undefined,
  moves: string[],
  fen: string,
  toMove: 'white' | 'black',
): TrapCandidate | undefined {
  if (!counts) return undefined
  const ranked = Object.entries(counts)
    .map(([san, c]) => ({ san, total: moveTotal(c, LOW_BANDS) }))
    .map((m) => ({ ...m, games: m.total[0] + m.total[1] + m.total[2] }))
    .sort((a, b) => b.games - a.games)
  const all = ranked.reduce((sum, m) => sum + m.games, 0)
  const [top] = ranked
  if (!top || top.games < TRAP_GAMES) return undefined
  const trapper = toMove === 'white' ? 'black' : 'white'
  const share = Math.round((top.games / all) * 100)
  const score = scoreFor(top.total, trapper)!
  if (share < TRAP_SHARE || score < TRAP_SCORE) return undefined
  return {
    moves: [...moves],
    fen,
    trapper,
    bait: top.san,
    baitShare: share,
    trapperScore: score,
    games: top.games,
  }
}

/**
 * Where a trap shows in an opening: the moves to its position in the opening's own order (a
 * named line's, else the order it was found in), or undefined when it isn't the opening's (its
 * position isn't reached through the opening's main position).
 */
export function trapInOpening(
  trap: readonly string[],
  entry: { main: string; lines: readonly BookLine[] },
): string[] | undefined {
  const keys = lineKeys(trap)
  const main = lineKeys(entry.main.split(' '))?.at(-1)
  if (!keys || !main) return undefined
  const at = keys.at(-1)!
  for (const line of entry.lines) {
    const moves = line.moves.split(' ')
    const lineKeysOf = lineKeys(moves) ?? []
    const index = lineKeysOf.indexOf(at)
    if (index >= 0 && lineKeysOf.slice(0, index + 1).includes(main)) return moves.slice(0, index)
  }
  return keys.includes(main) ? [...trap] : undefined
}

/**
 * The engine's word on a candidate: the bait loses this much winning chance (0–100) against the
 * best move. A trap costs at least TRAP_LOSS.
 */
export const TRAP_LOSS = 15

/** The library file (apps/api/data/opening-library.json), as the build script writes it. */
export interface LibraryFile {
  version: 1
  source: string
  /** Games counted per band. */
  games: Record<Band, number>
  openings: (LibraryEntry & {
    lines: BookLine[]
    numbers: OpeningNumbers
    tags: OpeningTags
  })[]
  traps: (Omit<TrapCandidate, 'fen' | 'moves'> & {
    /** SAN from the start, in the order it was found. */
    moves: string
    /** How much winning chance the bait gives away, by the engine (0–100). */
    loss: number
    /** The engine's move instead of the bait. */
    best?: string
    /** How the trapper goes on after the bait. */
    punish: string
    /** The openings it shows in, with the moves in each one's own order. */
    openings: { id: string; moves: string }[]
  })[]
  /** Per library position (book key), the moves played and their results per band. */
  positions: Record<string, PositionCounts>
}

// ---------------------------------------------------------------------------------------------
// Reading the library

/** A move in an opening's tree of named lines, with how it does in real games. */
export interface LibraryNode {
  /** SAN from the start. */
  moves: string[]
  /** The named line that ends here, if one does. */
  name?: string
  eco?: string
  /** The move's games and results per band (white, draws, black), from the position before it. */
  stats: Record<Band, [number, number, number]>
}

/** The named lines as a tree, depth first (a line's moves in the book's order), with their stats. */
export function libraryTree(
  lines: readonly BookLine[],
  positions: Readonly<Record<string, PositionCounts>>,
): LibraryNode[] {
  const nodes = new Map<string, LibraryNode>()
  for (const line of lines) {
    const moves = line.moves.split(' ')
    const keys = lineKeys(moves)
    if (!keys) continue
    moves.slice(0, LIBRARY_PLIES).forEach((san, i) => {
      const path = moves.slice(0, i + 1)
      const id = path.join(' ')
      const node = nodes.get(id) ?? { moves: path, stats: moveStats(positions[keys[i]!]?.[san]) }
      if (i === moves.length - 1) {
        node.name = line.name
        node.eco = line.eco
      }
      nodes.set(id, node)
    })
  }
  return sortTree([...nodes.values()])
}

/** Depth first: each node right after its parent, siblings by games played. */
function sortTree(nodes: LibraryNode[]): LibraryNode[] {
  const children = new Map<string, LibraryNode[]>()
  for (const node of nodes) {
    const parent = node.moves.slice(0, -1).join(' ')
    children.set(parent, [...(children.get(parent) ?? []), node])
  }
  const games = (n: LibraryNode) =>
    Object.values(n.stats).reduce((sum, [w, d, b]) => sum + w + d + b, 0)
  const out: LibraryNode[] = []
  const walk = (parent: string) => {
    const kids = (children.get(parent) ?? []).sort((a, b) => games(b) - games(a))
    for (const kid of kids) {
      out.push(kid)
      walk(kid.moves.join(' '))
    }
  }
  // Roots: nodes whose parent isn't in the tree (a line's first move, or past LIBRARY_PLIES).
  const ids = new Set(nodes.map((n) => n.moves.join(' ')))
  const roots = [...new Set(nodes.map((n) => n.moves.slice(0, -1).join(' ')))].filter(
    (parent) => !ids.has(parent),
  )
  for (const root of roots) walk(root)
  return out
}

/** A move's counts as results per band. */
export function moveStats(move: BandCounts | undefined): Record<Band, [number, number, number]> {
  const stats = {} as Record<Band, [number, number, number]>
  BANDS.forEach((band, i) => {
    stats[band] = move ? [move[i * 3]!, move[i * 3 + 1]!, move[i * 3 + 2]!] : [0, 0, 0]
  })
  return stats
}

/** What real games played in a position of the library, most played first; undefined if unknown. */
export function positionMoves(
  moves: readonly string[],
  positions: Readonly<Record<string, PositionCounts>>,
): { san: string; stats: Record<Band, [number, number, number]> }[] | undefined {
  const key = lineKeys(moves)?.at(-1)
  const counts = key === undefined ? undefined : positions[key]
  if (!counts) return undefined
  return Object.entries(counts)
    .map(([san, move]) => ({ san, stats: moveStats(move), games: move.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.games - a.games)
    .map(({ san, stats }) => ({ san, stats }))
}
