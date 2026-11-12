import type { LibraryPuzzleBody, NextPuzzleRequestBody, PuzzleLibraryBody } from '@pawnia/contracts'

// Types only (and an error to tell apart): app.ts, and through it the web app's typed client,
// sees this file, not the code behind it.

/** The puzzle library as the routes see it. Every method throws NoPuzzleSetError without a file. */
export interface PuzzleLibraryService {
  library(): Promise<PuzzleLibraryBody>
  /** Undefined when no puzzle is left: none of the wanted themes, or all of them excluded. */
  next(wish: NextPuzzleRequestBody): Promise<LibraryPuzzleBody | undefined>
  /** Undefined for an id the library doesn't have. */
  puzzle(id: string): Promise<LibraryPuzzleBody | undefined>
}

/** The puzzle set's file isn't there (or isn't one): it has to be fetched first. */
export class NoPuzzleSetError extends Error {
  constructor(path: string, why: string) {
    super(`No puzzle set at ${path} (${why}). Fetch it with: bun run --cwd apps/api puzzles:fetch`)
    this.name = 'NoPuzzleSetError'
  }
}
