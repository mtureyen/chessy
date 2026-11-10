import type { OpeningBody, OpeningsBody } from '@pawnia/contracts'

// Types only: app.ts (and through it the web app's typed client) sees this file, not the code
// behind it.

/** Which games count: the newest finished platform games, of one speed if given. */
export interface OpeningsQuery {
  last: number
  speed?: 'bullet' | 'blitz' | 'rapid' | 'classical'
}

/** The user's openings, for training them. */
export interface OpeningService {
  /** Throws when there is no database or no opening book. */
  openings(query: OpeningsQuery): Promise<OpeningsBody>
  /** Undefined when the user has no such games. Throws like openings(). */
  opening(
    color: 'white' | 'black',
    family: string,
    query: OpeningsQuery,
  ): Promise<OpeningBody | undefined>
}
