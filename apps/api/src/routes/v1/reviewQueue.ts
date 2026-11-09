import {
  pauseReviewQueueRoute,
  resumeReviewQueueRoute,
  reviewQueueRoute,
  startReviewQueueRoute,
} from '@pawnia/contracts'
import {
  ReviewQueueBusyError,
  type ReviewQueueService,
} from '../../adapters/review/reviewQueueService'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

/** The review of the user's recent games on the server. */
export function reviewQueueRoutes({ reviewQueue }: { reviewQueue: ReviewQueueService }) {
  return createRouter()
    .openapi(reviewQueueRoute, (c) => c.json(reviewQueue.status(), 200))
    .openapi(startReviewQueueRoute, async (c) => {
      try {
        return c.json(await reviewQueue.start(c.req.valid('json')), 200)
      } catch (error) {
        if (error instanceof ReviewQueueBusyError) {
          return problem(c, 409, 'Review running', { detail: error.message })
        }
        return problem(c, 503, 'Library unavailable', {
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    })
    .openapi(pauseReviewQueueRoute, async (c) => c.json(await reviewQueue.pause(), 200))
    .openapi(resumeReviewQueueRoute, async (c) => c.json(await reviewQueue.resume(), 200))
}
