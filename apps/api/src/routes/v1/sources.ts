import { historyRoute, playerRoute, recentGamesRoute, sourceGameRoute } from '@pawnia/contracts'
import {
  GameNotFoundError,
  SourceUnavailableError,
  UserNotFoundError,
  type GameSource,
  type SourceId,
} from '@pawnia/library'
import type { Context } from 'hono'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

export interface SourcesDeps {
  sources: Record<SourceId, GameSource>
}

export function sourceRoutes({ sources }: SourcesDeps) {
  return createRouter()
    .openapi(recentGamesRoute, async (c) => {
      const { source, username } = c.req.valid('param')
      const { max } = c.req.valid('query')
      try {
        return c.json({ games: await sources[source].recentGames(username, { max }) }, 200)
      } catch (error) {
        return sourceProblem(c, error)
      }
    })
    .openapi(sourceGameRoute, async (c) => {
      const { source, id } = c.req.valid('param')
      const { username } = c.req.valid('query')
      try {
        return c.json({ game: await sources[source].game(id, username ? { username } : {}) }, 200)
      } catch (error) {
        return sourceProblem(c, error)
      }
    })
    .openapi(historyRoute, async (c) => {
      const { source, username } = c.req.valid('param')
      const { cursor, since } = c.req.valid('query')
      try {
        const page = await sources[source].history(username, {
          ...(cursor && { cursor }),
          ...(since && { since }),
        })
        return c.json(page, 200)
      } catch (error) {
        return sourceProblem(c, error)
      }
    })
    .openapi(playerRoute, async (c) => {
      const { source, username } = c.req.valid('param')
      try {
        return c.json({ player: await sources[source].player(username) }, 200)
      } catch (error) {
        return sourceProblem(c, error)
      }
    })
}

/** The platform's failures as problem responses: 404, 429 (with Retry-After) or 502. */
export function sourceProblem(c: Context, error: unknown) {
  if (error instanceof UserNotFoundError)
    return problem(c, 404, 'User not found', { detail: error.message })
  if (error instanceof GameNotFoundError)
    return problem(c, 404, 'Game not found', { detail: error.message })
  if (error instanceof SourceUnavailableError) {
    if (error.retryAfterSeconds !== undefined) {
      c.header('Retry-After', String(error.retryAfterSeconds))
      return problem(c, 429, 'Too Many Requests', { detail: error.message })
    }
    return problem(c, 502, 'Bad Gateway', { detail: error.message })
  }
  throw error
}
