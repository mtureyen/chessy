import { myStatsRoute, playerStatsRoute } from '@pawnia/contracts'
import type { StatsService } from '../../adapters/stats/statsService'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'
import { sourceProblem } from './sources'

/** The stats page: the user's own numbers, and anyone's on lichess or chess.com. */
export function statsRoutes({ stats }: { stats: StatsService }) {
  return createRouter()
    .openapi(myStatsRoute, async (c) => {
      try {
        return c.json(await stats.mine(c.req.valid('query')), 200)
      } catch (error) {
        return problem(c, 503, 'Library unavailable', {
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    })
    .openapi(playerStatsRoute, async (c) => {
      const { source, username } = c.req.valid('param')
      try {
        return c.json(await stats.player(source, username, c.req.valid('query')), 200)
      } catch (error) {
        return sourceProblem(c, error)
      }
    })
}
