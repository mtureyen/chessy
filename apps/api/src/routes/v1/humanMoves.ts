import { createGame, InvalidPositionError } from '@chessy/chess'
import { humanMovesStatusRoute, moveProbabilitiesRoute } from '@chessy/contracts'
import type { HumanMoveService } from '../../adapters/humanMoves/service'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

export function humanMoveRoutes({ humanMoves }: { humanMoves: HumanMoveService }) {
  return createRouter()
    .openapi(humanMovesStatusRoute, async (c) => c.json(await humanMoves.status(), 200))
    .openapi(moveProbabilitiesRoute, async (c) => {
      const { queries } = c.req.valid('json')
      for (const [index, query] of queries.entries()) {
        try {
          createGame(query.fen)
        } catch (error) {
          if (!(error instanceof InvalidPositionError)) throw error
          return problem(c, 400, 'Invalid position', {
            detail: `queries[${index}].fen: ${error.message}`,
          })
        }
      }
      const status = await humanMoves.status()
      if (!status.available) {
        return problem(c, 503, 'Human-move model unavailable', { detail: status.reason })
      }
      return c.json({ probabilities: await humanMoves.moveProbabilities(queries) }, 200)
    })
}
