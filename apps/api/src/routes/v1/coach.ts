import type { CoachAgent } from '@chessy/coach'
import { coachAgentsRoute, coachQuestionRoute } from '@chessy/contracts'
import { streamSSE } from 'hono/streaming'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

export function coachRoutes({ agents }: { agents: CoachAgent[] }) {
  return createRouter()
    .openapi(coachAgentsRoute, async (c) => {
      const list = await Promise.all(
        agents.map(async (agent) => {
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
        let writes: Promise<void> = Promise.resolve()
        await chosen.answer({ ...question, signal: c.req.raw.signal }, (event) => {
          writes = writes.then(() =>
            stream.writeSSE({ event: event.type, data: JSON.stringify(event) }),
          )
        })
        await writes
      }) as unknown as ReturnType<typeof c.text>
    })
}
