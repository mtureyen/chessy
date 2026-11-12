import { libraryPuzzleRoute, nextPuzzleRoute, puzzleLibraryRoute } from '@pawnia/contracts'
import {
  NoPuzzleSetError,
  type PuzzleLibraryService,
} from '../../adapters/puzzles/puzzleLibraryService'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

/** The puzzle library: lichess puzzles by theme and difficulty. */
export function puzzleRoutes({ puzzles }: { puzzles: PuzzleLibraryService }) {
  /** The set is fetched by hand (like the native engine): until then the routes say how. */
  const noSet = (error: unknown) => {
    if (!(error instanceof NoPuzzleSetError)) throw error
    return { detail: error.message }
  }
  return createRouter()
    .openapi(puzzleLibraryRoute, async (c) => {
      try {
        return c.json(await puzzles.library(), 200)
      } catch (error) {
        return problem(c, 503, 'No puzzles', noSet(error))
      }
    })
    .openapi(nextPuzzleRoute, async (c) => {
      const wish = c.req.valid('json')
      try {
        const puzzle = await puzzles.next(wish)
        if (!puzzle) {
          const of = wish.themes.length > 0 ? ` of ${wish.themes.join(', ')}` : ''
          const besides =
            wish.exclude.length > 0 ? ` besides the ${wish.exclude.length} excluded` : ''
          return problem(c, 404, 'No puzzle left', {
            detail: `The library has no puzzle${of}${besides}`,
          })
        }
        return c.json(puzzle, 200)
      } catch (error) {
        return problem(c, 503, 'No puzzles', noSet(error))
      }
    })
    .openapi(libraryPuzzleRoute, async (c) => {
      const { id } = c.req.valid('param')
      try {
        const puzzle = await puzzles.puzzle(id)
        if (!puzzle) return problem(c, 404, 'No such puzzle', { detail: `No puzzle "${id}"` })
        return c.json(puzzle, 200)
      } catch (error) {
        return problem(c, 503, 'No puzzles', noSet(error))
      }
    })
}
