import { createGame, InvalidPositionError } from '@chessy/chess'
import {
  engineStatusRoute,
  EvaluationRequestSchema,
  evaluationsRoute,
  type EvaluationEvent,
} from '@chessy/contracts'
import type { EngineService } from '../../adapters/engine/service'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

export function engineRoutes({ engine }: { engine: EngineService }) {
  const router = createRouter()
  // The evaluation stream is documented from the contract but served by a plain handler: the
  // typed OpenAPI handlers only produce JSON bodies, this one streams NDJSON.
  router.openAPIRegistry.registerPath(evaluationsRoute)
  return router
    .openapi(engineStatusRoute, async (c) => c.json(await engine.status(), 200))
    .post(evaluationsRoute.path, async (c) => {
      const parsed = EvaluationRequestSchema.safeParse(await c.req.json().catch(() => undefined))
      if (!parsed.success) {
        return problem(c, 400, 'Validation failed', {
          errors: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        })
      }
      const request = parsed.data
      for (const [index, fen] of request.fens.entries()) {
        try {
          createGame(fen)
        } catch (error) {
          if (!(error instanceof InvalidPositionError)) throw error
          return problem(c, 400, 'Invalid position', { detail: `fens[${index}]: ${error.message}` })
        }
      }
      const status = await engine.status()
      if (!status.available) return problem(c, 503, 'Engine unavailable', { detail: status.reason })

      // Stops the work when the client goes away (request aborted or stream cancelled).
      const abort = new AbortController()
      c.req.raw.signal.addEventListener('abort', () => abort.abort(), { once: true })
      const encoder = new TextEncoder()
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: EvaluationEvent) =>
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
          try {
            await engine.evaluate(request, {
              signal: abort.signal,
              onEvaluated: (index, value) => send({ type: 'evaluated', index, eval: value }),
            })
            send({ type: 'done' })
          } catch (error) {
            if (!abort.signal.aborted)
              send({
                type: 'error',
                message: error instanceof Error ? error.message : String(error),
              })
          } finally {
            if (!abort.signal.aborted) controller.close()
          }
        },
        cancel() {
          abort.abort()
        },
      })
      // A plain Response: the typed router only knows JSON bodies, this one is a stream.
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
      })
    })
}
