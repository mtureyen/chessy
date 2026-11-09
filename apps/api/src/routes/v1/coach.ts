import type { CoachAgent } from '@pawnia/coach'
import type { CoachDirectory } from '../../adapters/coach/coachDirectory'
import {
  coachAgentsRoute,
  coachCommentRoute,
  coachQuestionRoute,
  coachTryRoute,
  coachWalkthroughRoute,
  type CoachEventBody,
} from '@pawnia/contracts'
import {
  IllegalTryError,
  NoStoredReviewError,
  type WalkthroughService,
} from '../../adapters/coach/walkthroughService'
import { streamSSE } from 'hono/streaming'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

/** A comment line this often keeps the stream open while a tool runs (proxies close idle ones). */
const KEEP_ALIVE_MS = 15_000

/** The wanted agent, or the first available one; what is wrong when there is none. */
async function readyAgent(
  agents: CoachAgent[],
  wanted: string | undefined,
): Promise<
  { agent: CoachAgent } | { status: 404 | 503; title: string; detail: string; agent?: undefined }
> {
  const candidates = wanted ? agents.filter((a) => a.id === wanted) : agents
  if (candidates.length === 0) {
    return { status: 404, title: 'No such agent', detail: wanted ?? 'no agents configured' }
  }
  let reason = ''
  for (const candidate of candidates) {
    const status = await candidate.status()
    if (status.available) return { agent: candidate }
    reason ||= status.reason
  }
  return { status: 503, title: 'Coach unavailable', detail: reason }
}

export function coachRoutes({
  coach,
  walkthroughs,
}: {
  coach: CoachDirectory
  walkthroughs: WalkthroughService
}) {
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
      const found = await readyAgent(coach.agents(), wanted)
      if (!found.agent) return problem(c, found.status, found.title, { detail: found.detail })

      const chosen = found.agent
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
            write(() =>
              // The contract's event shape; the coach's own type must fit it.
              stream.writeSSE({
                event: event.type,
                data: JSON.stringify(event satisfies CoachEventBody),
              }),
            ),
          )
        } finally {
          clearInterval(keepAlive)
        }
        await writes
      }) as unknown as ReturnType<typeof c.text>
    })
    .openapi(coachCommentRoute, async (c) => {
      const { agent: wanted, ...move } = c.req.valid('json')
      const found = await readyAgent(coach.agents(), wanted)
      if (!found.agent) return problem(c, found.status, found.title, { detail: found.detail })
      try {
        const text = await found.agent.comment({ ...move, signal: c.req.raw.signal })
        return c.json({ text }, 200)
      } catch (error) {
        return problem(c, 502, 'No comment', { detail: messageOf(error) })
      }
    })
    .openapi(coachWalkthroughRoute, async (c) => {
      const request = c.req.valid('json')
      let kept
      try {
        kept = request.regenerate ? undefined : await walkthroughs.find(request)
      } catch (error) {
        if (error instanceof NoStoredReviewError) {
          return problem(c, 404, 'No review', { detail: error.message })
        }
        return problem(c, 503, 'Library unavailable', { detail: messageOf(error) })
      }
      if (kept) return c.json(kept, 200)
      const found = await readyAgent(coach.agents(), request.agent)
      if (!found.agent) return problem(c, found.status, found.title, { detail: found.detail })
      try {
        return c.json(await walkthroughs.write(request, found.agent, c.req.raw.signal), 200)
      } catch (error) {
        if (error instanceof NoStoredReviewError) {
          return problem(c, 404, 'No review', { detail: error.message })
        }
        return problem(c, 502, 'No walkthrough', { detail: messageOf(error) })
      }
    })
    .openapi(coachTryRoute, async (c) => {
      const request = c.req.valid('json')
      // Without a coach the verdict still stands.
      const { agent } = await readyAgent(coach.agents(), request.agent)
      try {
        return c.json(await walkthroughs.judge(request, agent, c.req.raw.signal), 200)
      } catch (error) {
        if (error instanceof NoStoredReviewError) {
          return problem(c, 404, 'No review', { detail: error.message })
        }
        if (error instanceof IllegalTryError) {
          return problem(c, 400, 'Illegal move', { detail: error.message })
        }
        return problem(c, 503, 'Cannot judge the move', { detail: messageOf(error) })
      }
    })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
