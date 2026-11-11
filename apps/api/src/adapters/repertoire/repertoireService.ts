import type { AddRepertoireLineBody, RepertoireLineBody } from '@pawnia/contracts'

// Types only: app.ts (and through it the web app's typed client) sees this file, not the code
// behind it.

/** The user's repertoire, as the routes see it. All of it throws without a database. */
export interface RepertoireService {
  list(): Promise<RepertoireLineBody[]>
  /** Throws IllegalLineError for a line that can't be played. */
  add(line: AddRepertoireLineBody): Promise<RepertoireLineBody>
  /** False when there was no such line. */
  remove(id: string): Promise<boolean>
  /** Undefined when there is no such line. */
  review(id: string, passed: boolean): Promise<RepertoireLineBody | undefined>
}

/** A line with a move that isn't legal where it is played. */
export class IllegalLineError extends Error {
  constructor(move: string) {
    super(`${move} is not a legal move there`)
    this.name = 'IllegalLineError'
  }
}
