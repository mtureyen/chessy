import {
  CoachEventSchema,
  type CoachEventBody,
  type CoachQuestionBody,
  type Problem,
} from '@chessy/contracts'
import type { ApiClient } from './client'

/** Asks the API's coach; the answer arrives as events while it is written. */
export class RemoteCoach {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  /**
   * Sends the question and calls `onEvent` for each event of the answer, resolving when the
   * stream ends. Throws when the coach can't answer at all (no agent, agent unavailable).
   */
  async ask(
    question: CoachQuestionBody,
    onEvent: (event: CoachEventBody) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await this.api.api.v1.coach.messages.$post(
      { json: question },
      signal ? { init: { signal } } : undefined,
    )
    if (res.status !== 200 || !res.body) {
      const problem = (await res.json().catch(() => ({}))) as Partial<Problem>
      throw new Error(problem.detail ?? problem.title ?? `HTTP ${res.status}`)
    }
    const reader = res.body.getReader()
    const events = new ServerSentEvents()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      for (const event of events.push(value)) onEvent(event)
    }
  }
}

/**
 * Splits a server-sent event stream into the coach's events: one JSON `data` per event,
 * comments (keep-alives) and events it doesn't know skipped.
 */
export class ServerSentEvents {
  private readonly decoder = new TextDecoder()
  private buffer = ''

  push(chunk: Uint8Array): CoachEventBody[] {
    this.buffer += this.decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n')
    const blocks = this.buffer.split('\n\n')
    this.buffer = blocks.pop() ?? ''
    return blocks.flatMap((block) => {
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n')
      if (!data) return []
      try {
        const parsed = CoachEventSchema.safeParse(JSON.parse(data))
        return parsed.success ? [parsed.data] : []
      } catch {
        return []
      }
    })
  }
}
