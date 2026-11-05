import type { CoachAgent } from '@chessy/coach'
import type { CoachDirectory } from '../../adapters/coach/coachDirectory'
import { coachAgentsRoute, coachQuestionRoute } from '@chessy/contracts'
import { streamSSE } from 'hono/streaming'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

/** A comment line this often keeps the stream open while a tool runs (proxies close idle ones). */
const KEEP_ALIVE_MS = 15_000

export function coachRoutes({ coach }: { coach: CoachDirectory }) {
  return createRouter()
    .openapi(coachAgentsRoute, async (c) => {
      const list = await Promise.all(
        coach.agents().map(async (agent) => {
          const status = await agent.status()
          return {
            id: agent.id,
            label: agent.label,
            available: status.available,
            ...(!status.available && { reason: status.reason }),
          }
        }),
      )
      return c.json({ agents: list }, 200)
    })
    .openapi(coachQuestionRoute, async (c) => {
      const { agent: wanted, ...question } = c.req.valid('json')
      const agents = coach.agents()
      const candidates = wanted ? agents.filter((a) => a.id === wanted) : agents
      if (candidates.length === 0) {
        return problem(c, 404, 'No such agent', { detail: wanted ?? 'no agents configured' })
      }
      let agent: CoachAgent | undefined
      let reason = ''
      for (const candidate of candidates) {
        const status = await candidate.status()
        if (status.available) {
          agent = candidate
          break
        }
        reason ||= status.reason
      }
      if (!agent) return problem(c, 503, 'Coach unavailable', { detail: reason })

      const chosen = agent
      // Typed as the contract's text/event-stream body.
      return streamSSE(c, async (stream) => {
        let writes: Promise<unknown> = Promise.resolve()
        const write = (send: () => Promise<unknown>) => {
          writes = writes.then(send)
        }
        const keepAlive = setInterval(
          () => write(() => stream.write(': keep-alive\n\n')),
          KEEP_ALIVE_MS,
        )
        try {
          await chosen.answer({ ...question, signal: c.req.raw.signal }, (event) =>
            write(() => stream.writeSSE({ event: event.type, data: JSON.stringify(event) })),
          )
        } finally {
          clearInterval(keepAlive)
        }
        await writes
      }) as unknown as ReturnType<typeof c.text>
    })
}
