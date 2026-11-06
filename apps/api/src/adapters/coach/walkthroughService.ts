import type { CancelSignal, CoachAgent } from '@chessy/coach'
import type {
  CoachTryBody,
  CoachTryRequestBody,
  CoachWalkthroughBody,
  CoachWalkthroughRequestBody,
} from '@chessy/contracts'

// Types only: app.ts (and through it the web app's typed client) sees this file, not the code
// behind it.

/** The coach's walkthroughs of reviewed games, as the routes see them. */
export interface WalkthroughService {
  /** The kept walkthrough, if it is of the current review. Throws NoStoredReviewError. */
  find(request: CoachWalkthroughRequestBody): Promise<CoachWalkthroughBody | undefined>
  /** Has the agent write it and keeps it. Throws NoStoredReviewError. */
  write(
    request: CoachWalkthroughRequestBody,
    agent: CoachAgent,
    signal?: CancelSignal,
  ): Promise<CoachWalkthroughBody>
  /**
   * Judges a move tried at a moment; the agent, if there is one, comments on a wrong one. Throws
   * NoStoredReviewError or IllegalTryError.
   */
  judge(
    request: CoachTryRequestBody,
    agent: CoachAgent | undefined,
    signal?: CancelSignal,
  ): Promise<CoachTryBody>
}

export class NoStoredReviewError extends Error {
  constructor() {
    super('This game has no stored review')
    this.name = 'NoStoredReviewError'
  }
}

export class IllegalTryError extends Error {
  constructor(move: string) {
    super(`${move} is not a legal move here`)
    this.name = 'IllegalTryError'
  }
}
