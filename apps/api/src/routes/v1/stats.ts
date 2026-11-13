import { myStatsRoute, playerStatsRoute, writePlayerSummaryRoute } from '@pawnia/contracts'
import type { CoachDirectory } from '../../adapters/coach/coachDirectory'
import type { PlayerSummaryService, StatsService } from '../../adapters/stats/statsService'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'
import { readyAgent } from './coach'
import { sourceProblem } from './sources'

const detailOf = (error: unknown) => ({
  detail: error instanceof Error ? error.message : String(error),
})

/** The stats page: the user's own numbers, and anyone's on lichess or chess.com. */
export function statsRoutes({
  stats,
  summaries,
  coach,
}: {
  stats: StatsService
  summaries: PlayerSummaryService
  coach: CoachDirectory
}) {
  return createRouter()
    .openapi(myStatsRoute, async (c) => {
      try {
        return c.json(await stats.mine(c.req.valid('query')), 200)
      } catch (error) {
        return problem(c, 503, 'Library unavailable', detailOf(error))
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
    .openapi(writePlayerSummaryRoute, async (c) => {
      const { player, agent: wanted, ...query } = c.req.valid('json')
      // The same numbers the page shows (a lookup's come from the few minutes' cache).
      let read
      if (player.kind === 'me') {
        try {
          read = await stats.mine(query)
        } catch (error) {
          return problem(c, 503, 'Library unavailable', detailOf(error))
        }
      } else {
        try {
          read = await stats.player(player.source, player.username, query)
        } catch (error) {
          return sourceProblem(c, error)
        }
      }
      if (read.window.found === 0) {
        return problem(c, 404, 'No games', { detail: 'No finished games like these to read' })
      }
      const found = await readyAgent(coach.agents(), wanted)
      if (!found.agent) return problem(c, found.status, found.title, { detail: found.detail })
      try {
        return c.json(await summaries.write(read, found.agent, c.req.raw.signal), 200)
      } catch (error) {
        return problem(c, 502, 'No summary', detailOf(error))
      }
    })
}
