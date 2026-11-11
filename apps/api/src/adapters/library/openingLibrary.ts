import { libraryTree, positionMoves, type LibraryFile } from '@pawnia/analysis'
import type { LibraryOpeningBody, LibraryPositionBody, OpeningLibraryBody } from '@pawnia/contracts'
import { readFile } from 'node:fs/promises'
import type { OpeningLibraryService } from './openingLibraryService'

/** Reads the library file (data/opening-library.json) the first time it is needed. */
export function libraryFile(path: string): () => Promise<LibraryFile> {
  let file: Promise<LibraryFile> | undefined
  return () => (file ??= readFile(path, 'utf8').then((text) => JSON.parse(text) as LibraryFile))
}

/** The opening library from its built file. */
export class FileOpeningLibrary implements OpeningLibraryService {
  private readonly load: () => Promise<LibraryFile>

  constructor(load: () => Promise<LibraryFile>) {
    this.load = load
  }

  async list(): Promise<OpeningLibraryBody> {
    const { source, games, openings, traps } = await this.load()
    return {
      source,
      games,
      openings: openings.map(({ names: _names, lines, ...opening }) => ({
        ...opening,
        lines: lines.length,
        traps: traps.filter((t) => t.openings.some((o) => o.id === opening.id)).length,
      })),
    }
  }

  async opening(id: string): Promise<LibraryOpeningBody | undefined> {
    const { openings, traps, positions } = await this.load()
    const found = openings.find((o) => o.id === id)
    if (!found) return undefined
    const { names: _names, lines, ...opening } = found
    return {
      ...opening,
      tree: libraryTree(lines, positions),
      traps: traps.flatMap(({ openings: within, moves: _found, ...trap }) => {
        const here = within.find((o) => o.id === id)
        return here ? [{ ...trap, moves: here.moves, yours: trap.trapper === opening.side }] : []
      }),
    }
  }

  async position(moves: readonly string[]): Promise<LibraryPositionBody | undefined> {
    const { positions } = await this.load()
    const found = positionMoves(moves, positions)
    return found && { moves: found }
  }
}
