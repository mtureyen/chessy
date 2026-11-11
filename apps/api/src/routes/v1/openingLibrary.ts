import {
  libraryOpeningRoute,
  libraryPositionRoute,
  openingGuideRoute,
  openingLibraryRoute,
  writeOpeningGuideRoute,
} from '@pawnia/contracts'
import type { CoachDirectory } from '../../adapters/coach/coachDirectory'
import type {
  OpeningGuideService,
  OpeningLibraryService,
} from '../../adapters/library/openingLibraryService'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'
import { readyAgent } from './coach'

/** The opening library: openings to study, their lines, real games and traps. */
export function openingLibraryRoutes({
  library,
  guides,
  coach,
}: {
  library: OpeningLibraryService
  guides: OpeningGuideService
  coach: CoachDirectory
}) {
  const unavailable = (error: unknown) => ({
    detail: error instanceof Error ? error.message : String(error),
  })
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
      .openapi(openingGuideRoute, async (c) => {
        const { id } = c.req.valid('param')
        try {
          const guide = await guides.find(id)
          if (!guide) return problem(c, 404, 'No guide', { detail: `No guide of "${id}" yet` })
          return c.json(guide, 200)
        } catch (error) {
          return problem(c, 503, 'Library unavailable', unavailable(error))
        }
      })
      .openapi(writeOpeningGuideRoute, async (c) => {
        const { id } = c.req.valid('param')
        const { agent: wanted, regenerate } = c.req.valid('json')
        let kept
        try {
          kept = regenerate ? undefined : await guides.find(id)
        } catch (error) {
          return problem(c, 503, 'Library unavailable', unavailable(error))
        }
        if (kept) return c.json(kept, 200)
        const found = await readyAgent(coach.agents(), wanted)
        if (!found.agent) return problem(c, found.status, found.title, { detail: found.detail })
        try {
          const guide = await guides.write(id, found.agent, c.req.raw.signal)
          if (!guide) return problem(c, 404, 'No such opening', { detail: `No opening "${id}"` })
          return c.json(guide, 200)
        } catch (error) {
          return problem(c, 502, 'No guide', unavailable(error))
        }
      })
  )
}
