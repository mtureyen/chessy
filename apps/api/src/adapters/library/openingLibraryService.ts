import type { LibraryOpeningBody, LibraryPositionBody, OpeningLibraryBody } from '@pawnia/contracts'

// Types only: app.ts (and through it the web app's typed client) sees this file, not the code
// behind it.

/** The opening library as the routes see it. */
export interface OpeningLibraryService {
  list(): Promise<OpeningLibraryBody>
  /** Undefined for an id the library doesn't have. */
  opening(id: string): Promise<LibraryOpeningBody | undefined>
  /** Undefined for a position the library doesn't have (or illegal moves). */
  position(moves: readonly string[]): Promise<LibraryPositionBody | undefined>
}
