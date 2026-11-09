import type { ReviewQueueBody, StartReviewQueueBody } from '@pawnia/contracts'

// Types only: app.ts (and through it the web app's typed client) sees this file, not the code
// behind it.

/** The review of the user's recent games, as the routes see it. */
export interface ReviewQueueService {
  status(): ReviewQueueBody
  /** Throws ReviewQueueBusyError while a run is going on. */
  start(request: StartReviewQueueBody): Promise<ReviewQueueBody>
  pause(): Promise<ReviewQueueBody>
  resume(): Promise<ReviewQueueBody>
}

export class ReviewQueueBusyError extends Error {
  constructor() {
    super('A review run is going on')
    this.name = 'ReviewQueueBusyError'
  }
}
