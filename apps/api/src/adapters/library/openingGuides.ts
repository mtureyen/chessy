import {
  BANDS,
  libraryTree,
  positionMoves,
  type LibraryFile,
  type LibraryNode,
} from '@pawnia/analysis'
import {
  writeLineNotes,
  writeOpeningGuide,
  type CancelSignal,
  type CoachAgent,
  type LineNotesFacts,
  type OpeningGuideFacts,
} from '@pawnia/coach'
import { createGame } from '@pawnia/chess'
import type { LineNotesBody, OpeningGuideBody } from '@pawnia/contracts'
import { IllegalLineError } from '../repertoire/repertoireService'

/** Where guides are kept: the server's database. */
export interface GuideStore {
  findGuide(openingId: string): Promise<OpeningGuideBody | undefined>
  saveGuide(openingId: string, guide: OpeningGuideBody): Promise<void>
  /** The notes on one line (its SAN moves, space-separated). */
  findLineNotes(openingId: string, moves: string): Promise<LineNotesBody | undefined>
  saveLineNotes(openingId: string, moves: string, notes: LineNotesBody): Promise<void>
}

/** The guide annotates the main moves and the most played after them, up to this many plies. */
export const GUIDE_PLIES = 12
const VARIATIONS = 10
const REPLIES = 5

/**
 * The coach's study guides of the library's openings: written once from the library's facts,
 * kept in the database.
 */
export class OpeningGuides {
  private readonly load: () => Promise<LibraryFile>
  private readonly store: GuideStore
  private readonly now: () => Date
  /** The writing going on, by what is written: asked again meanwhile, the coach isn't. */
  private readonly writing = new Map<string, Promise<unknown>>()

  constructor(load: () => Promise<LibraryFile>, store: GuideStore, now = () => new Date()) {
    this.load = load
    this.store = store
    this.now = now
  }

  /** The kept guide; throws when there is no database. */
  find(openingId: string): Promise<OpeningGuideBody | undefined> {
    return this.store.findGuide(openingId)
  }

  /**
   * Writes the guide and keeps it; undefined for an opening the library doesn't have. Asked for
   * the same guide while it is being written, this waits for that one: a second request (a
   * second click, another tab) must not pay the coach twice.
   */
  write(
    openingId: string,
    agent: CoachAgent,
    signal?: CancelSignal,
  ): Promise<OpeningGuideBody | undefined> {
    return this.once(`guide ${openingId}`, () => this.writeGuide(openingId, agent, signal))
  }

  private async writeGuide(
    openingId: string,
    agent: CoachAgent,
    signal?: CancelSignal,
  ): Promise<OpeningGuideBody | undefined> {
    const facts = await this.facts(openingId)
    if (!facts) return undefined
    const written = await writeOpeningGuide(agent, facts, signal)
    const guide: OpeningGuideBody = {
      story: written.story,
      ideas: written.ideas,
      opponents: written.opponents,
      moves: written.moves.map(({ ply, note, draw }) => ({
        ply,
        san: facts.line.find((m) => m.ply === ply)!.move.replace(/^\d+\.(\.\.)?/, ''),
        note,
        ...(draw && { draw }),
      })),
      agent: agent.label,
      writtenAt: this.now().toISOString(),
    }
    await this.store.saveGuide(openingId, guide)
    return guide
  }

  /** The kept notes on a line; throws IllegalLineError for a line that can't be played. */
  findLine(openingId: string, moves: readonly string[]): Promise<LineNotesBody | undefined> {
    return this.store.findLineNotes(openingId, sanLine(moves).join(' '))
  }

  /**
   * Writes the notes on a line and keeps them; undefined for an opening the library hasn't. Like
   * a guide, the same line is written once at a time.
   */
  writeLine(
    openingId: string,
    moves: readonly string[],
    agent: CoachAgent,
    signal?: CancelSignal,
  ): Promise<LineNotesBody | undefined> {
    // Illegal lines throw here, before anything is remembered as being written.
    const key = `line ${openingId} ${sanLine(moves).join(' ')}`
    return this.once(key, () => this.writeLineNotes(openingId, moves, agent, signal))
  }

  /** Runs `write` unless the same thing is being written: then its result is this one's too. */
  private once<T>(key: string, write: () => Promise<T>): Promise<T> {
    const going = this.writing.get(key) as Promise<T> | undefined
    if (going) return going
    const started = write().finally(() => this.writing.delete(key))
    this.writing.set(key, started)
    return started
  }

  private async writeLineNotes(
    openingId: string,
    moves: readonly string[],
    agent: CoachAgent,
    signal?: CancelSignal,
  ): Promise<LineNotesBody | undefined> {
    const facts = await this.lineFacts(openingId, moves)
    if (!facts) return undefined
    const line = sanLine(moves)
    const written = await writeLineNotes(agent, facts, signal)
    const notes: LineNotesBody = {
      moves: written.map(({ ply, note, draw }) => ({
        ply,
        san: line[ply - 1]!,
        note,
        ...(draw && { draw }),
      })),
      agent: agent.label,
      writtenAt: this.now().toISOString(),
    }
    await this.store.saveLineNotes(openingId, line.join(' '), notes)
    return notes
  }

  /** What the coach writes a line's notes from: the library's facts about that line. */
  async lineFacts(
    openingId: string,
    moves: readonly string[],
  ): Promise<LineNotesFacts | undefined> {
    const { openings, positions } = await this.load()
    const opening = openings.find((o) => o.id === openingId)
    if (!opening) return undefined
    const line = sanLine(moves)
    const here = line.join(' ')
    // The longest named line the moves go through.
    const variation = libraryTree(opening.lines, positions)
      .filter((node) => node.name && `${here} `.startsWith(`${node.moves.join(' ')} `))
      .sort((a, b) => b.moves.length - a.moves.length)[0]?.name
    let last: Stats | undefined
    const noted = withPositions(line).map((move, i) => {
      const options = positionMoves(line.slice(0, i), positions) ?? []
      const total = options.reduce((sum, m) => sum + all(m.stats), 0)
      last = options.find((m) => m.san === line[i])?.stats
      return {
        ...move,
        ...(last && total > 0 && { share: Math.round((all(last) / total) * 100) }),
      }
    })
    const score = last && sideScore(sum(last), opening.side)
    return {
      opening: opening.name,
      side: opening.side,
      ...(variation && { variation }),
      line: noted,
      ...(score !== undefined && { score }),
    }
  }

  /** What the coach writes from: the library's own facts about the opening. */
  async facts(openingId: string): Promise<OpeningGuideFacts | undefined> {
    const { openings, traps, positions } = await this.load()
    const opening = openings.find((o) => o.id === openingId)
    if (!opening) return undefined
    const tree = libraryTree(opening.lines, positions)
    const main = opening.main.split(' ')
    const line = studyLine(main, tree)
    const variations = tree
      .filter((node) => node.name)
      .sort((a, b) => played(b) - played(a))
      .slice(0, VARIATIONS)
      .map((node) => {
        const score = scoreFor(node, opening.side)
        return {
          name: node.name!,
          moves: numbered(node.moves),
          games: played(node),
          ...(score !== undefined && { score }),
        }
      })
    const options = positionMoves(main, positions) ?? []
    const total = options.reduce((sum, m) => sum + all(m.stats), 0)
    const replies = options.slice(0, REPLIES).map((m) => {
      const score = sideScore(sum(m.stats), opening.side)
      return {
        move: moveLabel(main.length + 1, m.san),
        share: total > 0 ? Math.round((all(m.stats) / total) * 100) : 0,
        ...(score !== undefined && { score }),
      }
    })
    const scores = Object.fromEntries(
      Object.entries(opening.numbers.score).filter(([, v]) => v !== undefined),
    ) as Record<string, number>
    return {
      name: opening.name,
      side: opening.side,
      main: numbered(main),
      line: withPositions(line),
      variations,
      replies,
      scores,
      traps: traps.flatMap((trap) => {
        const here = trap.openings.find((o) => o.id === openingId)
        if (!here) return []
        const victim = trap.trapper === 'white' ? 'Black' : 'White'
        return [
          `After ${numbered(here.moves.split(' '))}, ${trap.baitShare}% of ${victim} players under 1600 play ${trap.bait}; ${trap.trapper === 'white' ? 'White' : 'Black'} then scores ${trap.trapperScore}%.${trap.best ? ` Better is ${trap.best}.` : ''} After ${trap.bait}: ${trap.punish}`,
        ]
      }),
    }
  }
}

/** The moves as they are written (SAN); throws IllegalLineError at one that can't be played. */
export function sanLine(moves: readonly string[]): string[] {
  const game = createGame()
  return moves.map((move) => {
    const san = game.play(move)?.move?.san
    if (!san) throw new IllegalLineError(move)
    return san
  })
}

/** The line's moves, numbered, each with the position after it: what the coach draws on. */
export function withPositions(line: readonly string[]): OpeningGuideFacts['line'] {
  const game = createGame()
  return line.map((san, i) => {
    game.play(san)
    return { ply: i + 1, move: moveLabel(i + 1, san), fen: game.fen() }
  })
}

/** The main moves, then the most played named continuation, up to GUIDE_PLIES. */
export function studyLine(main: readonly string[], tree: readonly LibraryNode[]): string[] {
  const line = [...main]
  while (line.length < GUIDE_PLIES) {
    const here = line.join(' ')
    const next = tree
      .filter((n) => n.moves.length === line.length + 1 && n.moves.slice(0, -1).join(' ') === here)
      .sort((a, b) => played(b) - played(a))[0]
    if (!next) break
    line.push(next.moves.at(-1)!)
  }
  return line.slice(0, Math.max(GUIDE_PLIES, main.length))
}

/** A move with its number, from its half-move: "2.d4", "2...d5". */
export function moveLabel(ply: number, san: string): string {
  const number = Math.ceil(ply / 2)
  return ply % 2 === 1 ? `${number}.${san}` : `${number}...${san}`
}

/** "1.e4 c6 2.d4": SAN with move numbers, Black's first move as "1...c6" when it starts. */
export function numbered(moves: readonly string[]): string {
  return moves
    .map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.${san}` : i === 0 ? `1...${san}` : san))
    .join(' ')
}

type Stats = LibraryNode['stats']

function sum(stats: Stats): [number, number, number] {
  return BANDS.reduce<[number, number, number]>(
    (acc, band) => [acc[0] + stats[band][0], acc[1] + stats[band][1], acc[2] + stats[band][2]],
    [0, 0, 0],
  )
}

const all = (stats: Stats) => sum(stats).reduce((a, b) => a + b, 0)
const played = (node: LibraryNode) => all(node.stats)

function sideScore([w, d, b]: [number, number, number], side: 'white' | 'black') {
  const total = w + d + b
  if (total === 0) return undefined
  return Math.round((((side === 'white' ? w : b) + d / 2) / total) * 100)
}

function scoreFor(node: LibraryNode, side: 'white' | 'black') {
  return sideScore(sum(node.stats), side)
}
