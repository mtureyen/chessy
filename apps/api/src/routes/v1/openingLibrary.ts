import { libraryOpeningRoute, libraryPositionRoute, openingLibraryRoute } from '@pawnia/contracts'
import type { OpeningLibraryService } from '../../adapters/library/openingLibraryService'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

/** The opening library: openings to study, their lines, real games and traps. */
export function openingLibraryRoutes({ library }: { library: OpeningLibraryService }) {
  return (
    createRouter()
      .openapi(openingLibraryRoute, async (c) => c.json(await library.list(), 200))
      // Before /{id}, so "position" isn't taken for an opening's id.
      .openapi(libraryPositionRoute, async (c) => {
        const { moves } = c.req.valid('query')
        const found = await library.position(moves ? moves.split(',') : [])
        if (!found) {
          return problem(c, 404, 'Not in the library', {
            detail: `The library has no games from ${moves || 'the start'}`,
          })
        }
        return c.json(found, 200)
      })
      .openapi(libraryOpeningRoute, async (c) => {
        const { id } = c.req.valid('param')
        const found = await library.opening(id)
        if (!found) return problem(c, 404, 'No such opening', { detail: `No opening "${id}"` })
        return c.json(found, 200)
      })
  )
}
