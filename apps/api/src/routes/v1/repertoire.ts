import {
  addRepertoireLineRoute,
  removeRepertoireLineRoute,
  repertoireRoute,
  reviewRepertoireLineRoute,
} from '@pawnia/contracts'
import {
  IllegalLineError,
  type RepertoireService,
} from '../../adapters/repertoire/repertoireService'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

/** The user's repertoire: lines to keep, reviewed with growing gaps. */
export function repertoireRoutes({ repertoire }: { repertoire: RepertoireService }) {
  const unavailable = (error: unknown) => ({
    detail: error instanceof Error ? error.message : String(error),
  })
  return createRouter()
    .openapi(repertoireRoute, async (c) => {
      try {
        return c.json({ lines: await repertoire.list() }, 200)
      } catch (error) {
        return problem(c, 503, 'Library unavailable', unavailable(error))
      }
    })
    .openapi(addRepertoireLineRoute, async (c) => {
      try {
        return c.json({ line: await repertoire.add(c.req.valid('json')) }, 200)
      } catch (error) {
        if (error instanceof IllegalLineError)
          return problem(c, 400, 'Illegal move', { detail: error.message })
        return problem(c, 503, 'Library unavailable', unavailable(error))
      }
    })
    .openapi(removeRepertoireLineRoute, async (c) => {
      try {
        if (!(await repertoire.remove(c.req.valid('param').id))) {
          return problem(c, 404, 'No such line', { detail: 'Not in the repertoire' })
        }
        return c.json({ removed: true as const }, 200)
      } catch (error) {
        return problem(c, 503, 'Library unavailable', unavailable(error))
      }
    })
    .openapi(reviewRepertoireLineRoute, async (c) => {
      try {
        const line = await repertoire.review(c.req.valid('param').id, c.req.valid('json').passed)
        if (!line) return problem(c, 404, 'No such line', { detail: 'Not in the repertoire' })
        return c.json({ line }, 200)
      } catch (error) {
        return problem(c, 503, 'Library unavailable', unavailable(error))
      }
    })
}
