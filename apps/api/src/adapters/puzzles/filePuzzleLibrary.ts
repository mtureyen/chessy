import {
  pickPuzzle,
  puzzleStart,
  puzzleThemes,
  unpackPuzzle,
  type Puzzle,
  type PuzzleSetFile,
} from '@pawnia/analysis'
import type { LibraryPuzzleBody, NextPuzzleRequestBody, PuzzleLibraryBody } from '@pawnia/contracts'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { NoPuzzleSetError, type PuzzleLibraryService } from './puzzleLibraryService'

/** Where `bun run puzzles:fetch` puts the puzzle set. */
export const FETCHED_PUZZLE_SET = fileURLToPath(
  new URL('../../../.puzzles/lichess-puzzles.json', import.meta.url),
)

interface LoadedSet {
  library: PuzzleLibraryBody
  puzzles: Puzzle[]
  byId: Map<string, Puzzle>
}

/**
 * The puzzle library from its fetched file, read the first time it is needed and kept in memory
 * (about 80,000 puzzles). A failed read isn't kept: once the file has been fetched the next
 * request finds it, without a restart.
 */
export class FilePuzzleLibrary implements PuzzleLibraryService {
  private readonly path: string
  private readonly random: () => number
  private loaded: Promise<LoadedSet> | undefined

  constructor(path: string = FETCHED_PUZZLE_SET, random: () => number = Math.random) {
    this.path = path
    this.random = random
  }

  async library(): Promise<PuzzleLibraryBody> {
    return (await this.load()).library
  }

  async next({ themes, rating, exclude }: NextPuzzleRequestBody) {
    const { puzzles } = await this.load()
    const picked = pickPuzzle(puzzles, {
      themes,
      rating,
      exclude: new Set(exclude),
      random: this.random,
    })
    return picked && present(picked.puzzle, picked.theme)
  }

  async puzzle(id: string) {
    const found = (await this.load()).byId.get(id)
    return found && present(found)
  }

  private load(): Promise<LoadedSet> {
    this.loaded ??= read(this.path).catch((error: unknown) => {
      this.loaded = undefined
      throw error
    })
    return this.loaded
  }
}

async function read(path: string): Promise<LoadedSet> {
  let file: PuzzleSetFile
  try {
    file = JSON.parse(await readFile(path, 'utf8')) as PuzzleSetFile
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
    throw new NoPuzzleSetError(path, missing ? 'no such file' : 'not readable as JSON')
  }
  if (file.version !== 1 || !Array.isArray(file.puzzles)) {
    throw new NoPuzzleSetError(path, 'not a puzzle set of this version')
  }
  const puzzles = file.puzzles.map(unpackPuzzle)
  return {
    library: { source: file.source, puzzles: puzzles.length, themes: puzzleThemes(puzzles) },
    puzzles,
    byId: new Map(puzzles.map((puzzle) => [puzzle.id, puzzle])),
  }
}

function present(puzzle: Puzzle, theme?: string): LibraryPuzzleBody | undefined {
  // The fetch script keeps only puzzles that can be played, so this finds a start.
  const start = puzzleStart(puzzle)
  return (
    start && {
      id: puzzle.id,
      url: `https://lichess.org/training/${puzzle.id}`,
      ...start,
      rating: puzzle.rating,
      themes: puzzle.themes,
      ...(theme && { theme }),
    }
  )
}
