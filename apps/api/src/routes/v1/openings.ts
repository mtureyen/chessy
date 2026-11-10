import { openingRoute, openingsRoute } from '@pawnia/contracts'
import type { OpeningService } from '../../adapters/openings/openingService'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

/** The user's openings, for training them. */
export function openingRoutes({ openings }: { openings: OpeningService }) {
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
}
