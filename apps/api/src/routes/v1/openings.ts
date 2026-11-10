import { openingRoute, openingsRoute, practiceCheckRoute } from '@pawnia/contracts'
import type { OpeningService } from '../../adapters/openings/openingService'
import { IllegalPracticeMoveError, type OpeningPractice } from '../../adapters/openings/practice'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

/** The user's openings, for training them. */
export function openingRoutes({
  openings,
  practice,
}: {
  openings: OpeningService
  practice: Pick<OpeningPractice, 'check'>
}) {
  const unavailable = (error: unknown) => ({
    detail: error instanceof Error ? error.message : String(error),
  })
  return createRouter()
    .openapi(openingsRoute, async (c) => {
      try {
        return c.json(await openings.openings(c.req.valid('query')), 200)
      } catch (error) {
        return problem(c, 503, 'Openings unavailable', unavailable(error))
      }
    })
    .openapi(openingRoute, async (c) => {
      const { color } = c.req.valid('param')
      const { family, ...query } = c.req.valid('query')
      try {
        const found = await openings.opening(color, family, query)
        if (!found) {
          return problem(c, 404, 'No such opening', {
            detail: `No ${color} games in the ${family} among these`,
          })
        }
        return c.json(found, 200)
      } catch (error) {
        return problem(c, 503, 'Openings unavailable', unavailable(error))
      }
    })
    .openapi(practiceCheckRoute, async (c) => {
      try {
        return c.json(await practice.check(c.req.valid('json')), 200)
      } catch (error) {
        if (error instanceof IllegalPracticeMoveError)
          return problem(c, 400, 'Illegal move', { detail: error.message })
        return problem(c, 503, 'Practice unavailable', unavailable(error))
      }
    })
}
