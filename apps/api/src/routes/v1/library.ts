import type { GameReview } from '@chessy/analysis'
import { createGame, InvalidPositionError, PgnImportError } from '@chessy/chess'
import {
  findLibraryReviewRoute,
  getProfileRoute,
  libraryStatusRoute,
  missingLibraryGamesRoute,
  saveLibraryGamesRoute,
  saveLibraryReviewRoute,
  saveProfileRoute,
} from '@chessy/contracts'
import { gameLine } from '@chessy/history'
import { DuplicateGameError, type LibraryGame } from '@chessy/library'
import type { LibraryService } from '../../adapters/db/libraryService'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

export function libraryRoutes({
  library,
  now = Date.now,
}: {
  library: LibraryService
  now?: () => number
}) {
  return createRouter()
    .openapi(libraryStatusRoute, async (c) => c.json(await library.status(), 200))
    .openapi(saveLibraryGamesRoute, async (c) => {
      const { games } = c.req.valid('json')
      for (const [index, game] of games.entries()) {
        try {
          gameLine(game.pgn)
        } catch (error) {
          if (!(error instanceof PgnImportError)) throw error
          return problem(c, 400, 'Invalid PGN', { detail: `games[${index}]: ${error.message}` })
        }
      }
      const status = await library.status()
      if (!status.available) {
        return problem(c, 503, 'Library unavailable', { detail: status.reason })
      }
      try {
        await library.saveGames(games as LibraryGame[])
      } catch (error) {
        if (!(error instanceof DuplicateGameError)) throw error
        return problem(c, 409, 'Duplicate game', { detail: error.message })
      }
      return c.json({ stored: games.length }, 200)
    })
    .openapi(missingLibraryGamesRoute, async (c) => {
      const status = await library.status()
      if (!status.available) {
        return problem(c, 503, 'Library unavailable', { detail: status.reason })
      }
      return c.json({ missing: await library.missingGames(c.req.valid('json').ids) }, 200)
    })
    .openapi(saveLibraryReviewRoute, async (c) => {
      const { startFen, moves, review } = c.req.valid('json')
      try {
        createGame(startFen)
      } catch (error) {
        if (!(error instanceof InvalidPositionError)) throw error
        return problem(c, 400, 'Invalid position', { detail: `startFen: ${error.message}` })
      }
      if (review.moves.length !== moves.length || review.moves.some((m, i) => m.uci !== moves[i])) {
        return problem(c, 400, 'Invalid review', { detail: 'The review is of other moves' })
      }
      const status = await library.status()
      if (!status.available) {
        return problem(c, 503, 'Library unavailable', { detail: status.reason })
      }
      // The checked body drops what the schema doesn't name; keep the review as the app sent it.
      const sent = (await c.req.json()) as { review: GameReview }
      await library.saveReview({
        line: { startFen, moves },
        review: sent.review,
        reviewedAt: new Date(now()).toISOString(),
      })
      return c.json({ stored: true as const }, 200)
    })
    .openapi(findLibraryReviewRoute, async (c) => {
      const status = await library.status()
      if (!status.available) {
        return problem(c, 503, 'Library unavailable', { detail: status.reason })
      }
      const found = await library.findReview(c.req.valid('json'))
      if (!found) return problem(c, 404, 'No review', { detail: 'This line has no stored review' })
      return c.json({ review: found.review, reviewedAt: found.reviewedAt }, 200)
    })
    .openapi(getProfileRoute, async (c) => {
      const status = await library.status()
      if (!status.available) {
        return problem(c, 503, 'Library unavailable', { detail: status.reason })
      }
      return c.json({ profile: (await library.profile()) ?? null }, 200)
    })
    .openapi(saveProfileRoute, async (c) => {
      const { profile } = c.req.valid('json')
      if (new Set(profile.accounts.map((a) => a.source)).size !== profile.accounts.length) {
        return problem(c, 400, 'Invalid profile', { detail: 'One account per platform' })
      }
      const status = await library.status()
      if (!status.available) {
        return problem(c, 503, 'Library unavailable', { detail: status.reason })
      }
      await library.saveProfile(profile)
      return c.json({ stored: true as const }, 200)
    })
}
