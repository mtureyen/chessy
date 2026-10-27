import { recentGamesRoute } from '@chessy/contracts'
import {
  SourceUnavailableError,
  UserNotFoundError,
  type GameSource,
  type SourceId,
} from '@chessy/library'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

export interface SourcesDeps {
  sources: Record<SourceId, GameSource>
}

export function sourceRoutes({ sources }: SourcesDeps) {
  return createRouter().openapi(recentGamesRoute, async (c) => {
    const { source, username } = c.req.valid('param')
    const { max } = c.req.valid('query')
    try {
      const games = await sources[source].recentGames(username, { max })
      return c.json({ games }, 200)
    } catch (error) {
      if (error instanceof UserNotFoundError)
        return problem(c, 404, 'User not found', { detail: error.message })
      if (error instanceof SourceUnavailableError) {
        if (error.retryAfterSeconds !== undefined) {
          c.header('Retry-After', String(error.retryAfterSeconds))
          return problem(c, 429, 'Too Many Requests', { detail: error.message })
        }
        return problem(c, 502, 'Bad Gateway', { detail: error.message })
      }
      throw error
    }
  })
}
