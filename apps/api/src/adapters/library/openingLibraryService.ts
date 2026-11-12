import type { CancelSignal, CoachAgent } from '@pawnia/coach'
import type {
  LineNotesBody,
  LibraryOpeningBody,
  LibraryPositionBody,
  OpeningGuideBody,
  OpeningLibraryBody,
} from '@pawnia/contracts'

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

/** The coach's study guides of the library's openings, as the routes see them. */
export interface OpeningGuideService {
  /** The kept guide. Throws when there is no database. */
  find(openingId: string): Promise<OpeningGuideBody | undefined>
  /** Writes and keeps it; undefined for an opening the library doesn't have. */
  write(
    openingId: string,
    agent: CoachAgent,
    signal?: CancelSignal,
  ): Promise<OpeningGuideBody | undefined>
  /** The kept notes on a line. Throws IllegalLineError for a line that can't be played. */
  findLine(openingId: string, moves: readonly string[]): Promise<LineNotesBody | undefined>
  /** Writes and keeps them; undefined for an opening the library doesn't have. */
  writeLine(
    openingId: string,
    moves: readonly string[],
    agent: CoachAgent,
    signal?: CancelSignal,
  ): Promise<LineNotesBody | undefined>
}
