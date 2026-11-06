/**
 * Test helpers. Import from `@chessy/coach/testing`. The same contract suite runs against every
 * LlmClient adapter, each with a fake server that speaks its provider's wire format.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ChatMessage, ToolCall } from './domain/messages'
import { defineTool } from './domain/tools'
import type { LlmClient, LlmTurn } from './ports/llmClient'
import { runToolLoop } from './usecases/runToolLoop'

/** A model turn as a test scripts it, independent of any provider. */
export interface ScriptedTurn {
  text?: string
  toolCalls?: Omit<ToolCall, 'id'>[]
}

/** A client that plays back scripted turns and records what it was asked. */
export function scriptedClient(turns: ScriptedTurn[]) {
  const requests: { system: string; messages: ChatMessage[]; tools: string[] }[] = []
  let next = 0
  const client: LlmClient = {
    name: 'Scripted',
    status: async () => ({ available: true }),
    async turn({ system, messages, tools }, onText) {
      requests.push({
        system,
        messages: structuredClone(messages),
        tools: tools.map((t) => t.name),
      })
      const turn = turns[next++] ?? { text: '' }
      for (const word of (turn.text ?? '').split(/(?<= )/)) if (word) onText(word)
      const toolCalls = (turn.toolCalls ?? []).map((call, i) => ({
        ...call,
        id: `call-${next}-${i}`,
      }))
      const result: LlmTurn = {
        text: turn.text ?? '',
        toolCalls,
        stop: toolCalls.length > 0 ? 'tool_use' : 'end',
        providerState: { turn: next },
        usage: { inputTokens: 10, outputTokens: 5 },
      }
      return result
    },
  }
  return { client, requests }
}

/** A tool that echoes its input, for loop tests. */
export const echoTool = defineTool({
  name: 'echo',
  description: 'Repeats a value back.',
  input: z.object({ value: z.string() }),
  run: async ({ value }) => ({ content: JSON.stringify({ echoed: value }) }),
})

/** Behaviour every LlmClient adapter must show against its provider (a fake server of it). */
export function llmClientContract(
  name: string,
  setup: (
    script: ScriptedTurn[],
  ) =>
    | Promise<{ client: LlmClient; sentToolResults: () => string[] }>
    | { client: LlmClient; sentToolResults: () => string[] },
) {
  describe(`LlmClient contract: ${name}`, () => {
    let deltas: string[]
    beforeEach(() => {
      deltas = []
    })

    it('streams a text answer', async () => {
      const { client } = await setup([{ text: 'Develop your knight first.' }])
      const turn = await client.turn(
        { system: 'You coach.', messages: [{ role: 'user', text: 'What now?' }], tools: [] },
        (delta) => deltas.push(delta),
      )
      expect(turn).toMatchObject({ text: 'Develop your knight first.', toolCalls: [], stop: 'end' })
      expect(deltas.join('')).toBe('Develop your knight first.')
      expect(turn.usage.outputTokens).toBeGreaterThanOrEqual(0)
    })

    it('reports the tools the model calls', async () => {
      const { client } = await setup([{ toolCalls: [{ name: 'echo', input: { value: 'e4' } }] }])
      const turn = await client.turn(
        { system: 'You coach.', messages: [{ role: 'user', text: 'Echo e4' }], tools: [echoTool] },
        (delta) => deltas.push(delta),
      )
      expect(turn.stop).toBe('tool_use')
      expect(turn.toolCalls).toHaveLength(1)
      expect(turn.toolCalls[0]).toMatchObject({ name: 'echo', input: { value: 'e4' } })
      expect(turn.toolCalls[0]!.id).not.toBe('')
    })

    it('runs a whole tool loop, handing the tool results back', async () => {
      const { client, sentToolResults } = await setup([
        { toolCalls: [{ name: 'echo', input: { value: 'Nf3' } }] },
        { text: 'It echoed Nf3.' },
      ])
      const messages: ChatMessage[] = [{ role: 'user', text: 'Echo Nf3' }]
      await runToolLoop(client, { system: 'You coach.', messages, tools: [echoTool] }, () => {})
      expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
      expect(messages.at(-1)).toMatchObject({ role: 'assistant', text: 'It echoed Nf3.' })
      expect(sentToolResults()).toEqual([JSON.stringify({ echoed: 'Nf3' })])
    })
  })
}
