import { trainingResultRoute, trainingRoute } from '@pawnia/contracts'
import type { TrainingService } from '../../adapters/training/trainingService'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

/** Puzzles from the user's own mistakes. */
export function trainingRoutes({ training }: { training: TrainingService }) {
  const unavailable = (error: unknown) => ({
    detail: error instanceof Error ? error.message : String(error),
  })
  return createRouter()
    .openapi(trainingRoute, async (c) => {
      try {
        return c.json(await training.training(), 200)
      } catch (error) {
        return problem(c, 503, 'Library unavailable', unavailable(error))
      }
    })
    .openapi(trainingResultRoute, async (c) => {
      try {
        await training.record(c.req.valid('json'))
        return c.json({ stored: true as const }, 200)
      } catch (error) {
        return problem(c, 503, 'Library unavailable', unavailable(error))
      }
    })
}
