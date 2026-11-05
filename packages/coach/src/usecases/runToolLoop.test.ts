import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ChatMessage, CoachEvent } from '../domain/messages'
import { defineTool } from '../domain/tools'
import type { LlmClient } from '../ports/llmClient'
import { echoTool, scriptedClient } from '../testing'
import { CoachCancelledError, runToolLoop } from './runToolLoop'

const ask = (text: string): ChatMessage[] => [{ role: 'user', text }]

function collect() {
  const events: CoachEvent[] = []
  return { events, onEvent: (e: CoachEvent) => events.push(e) }
}

describe('runToolLoop', () => {
  it('runs the tools the model calls and asks again with their results', async () => {
    const { client, requests } = scriptedClient([
      { text: 'Let me check. ', toolCalls: [{ name: 'echo', input: { value: 'e4' } }] },
      { text: 'Done.' },
    ])
    const messages = ask('Echo e4')
    const { events, onEvent } = collect()
    const { usage } = await runToolLoop(
      client,
      { system: 's', messages, tools: [echoTool] },
      onEvent,
    )

    expect(messages[2]).toEqual({
      role: 'tool',
      results: [{ callId: 'call-1-0', content: '{"echoed":"e4"}' }],
    })
    expect(requests[1]!.messages).toHaveLength(3)
    expect(
      events
        .filter((e) => e.type === 'text')
        .map((e) => (e as { delta: string }).delta)
        .join(''),
    ).toBe('Let me check. Done.')
    expect(events).toContainEqual({ type: 'tool', name: 'echo', input: { value: 'e4' } })
    expect(events).toContainEqual({ type: 'tool_result', name: 'echo', ok: true })
    expect(usage).toEqual({ inputTokens: 20, outputTokens: 10 })
  })

  it('answers bad calls with an error for the model instead of running them', async () => {
    const failing = defineTool({
      name: 'boom',
      description: 'Always fails.',
      input: z.object({}),
      run: async () => {
        throw new Error('engine crashed')
      },
    })
    const { client } = scriptedClient([
      {
        toolCalls: [
          { name: 'echo', input: { value: 3 } },
          { name: 'nope', input: {} },
          { name: 'boom', input: {} },
        ],
      },
      { text: 'Sorry.' },
    ])
    const messages = ask('Try things')
    await runToolLoop(client, { system: 's', messages, tools: [echoTool, failing] }, () => {})
    const results = (messages[2] as Extract<ChatMessage, { role: 'tool' }>).results
    expect(results.map((r) => r.isError)).toEqual([true, true, true])
    expect(results[0]!.content).toMatch(/Invalid input/)
    expect(results[1]!.content).toMatch(/no tool named nope/)
    expect(results[2]!.content).toMatch(/engine crashed/)
  })

  it('takes the tools away for the last round, so the model has to answer', async () => {
    const calls = Array.from({ length: 3 }, () => ({
      toolCalls: [{ name: 'echo', input: { value: 'again' } }],
    }))
    const { client, requests } = scriptedClient([...calls, { text: 'Here is my answer.' }])
    await runToolLoop(
      client,
      { system: 's', messages: ask('Loop'), tools: [echoTool], maxRounds: 3 },
      () => {},
    )
    expect(requests.map((r) => r.tools)).toEqual([['echo'], ['echo'], ['echo'], []])
  })

  it('gives tools the context, passes drawings on and stops on refusals and when cancelled', async () => {
    const draw = defineTool({
      name: 'draw',
      description: 'Draws an arrow from e2 to the square on the board.',
      input: z.object({}),
      run: async (_input, context) => ({
        content: 'drawn',
        board: { arrows: [{ from: 'e2', to: context.fen ?? '?', color: 'green' }], squares: [] },
      }),
    })
    const { client } = scriptedClient([
      { toolCalls: [{ name: 'draw', input: {} }] },
      { text: 'See.' },
    ])
    const { events, onEvent } = collect()
    await runToolLoop(
      client,
      { system: 's', messages: ask('Show me'), tools: [draw], context: { fen: 'e4' } },
      onEvent,
    )
    expect(events).toContainEqual({
      type: 'board',
      drawing: { arrows: [{ from: 'e2', to: 'e4', color: 'green' }], squares: [] },
    })

    const refusing: LlmClient = {
      ...scriptedClient([]).client,
      turn: async () => ({
        text: '',
        toolCalls: [],
        stop: 'refusal',
        usage: { inputTokens: 1, outputTokens: 0 },
      }),
    }
    const refusal = collect()
    await runToolLoop(refusing, { system: 's', messages: ask('?'), tools: [] }, refusal.onEvent)
    expect(refusal.events).toEqual([
      { type: 'error', message: 'The model declined to answer this.' },
    ])

    await expect(
      runToolLoop(
        client,
        { system: 's', messages: ask('?'), tools: [], signal: { aborted: true } },
        () => {},
      ),
    ).rejects.toBeInstanceOf(CoachCancelledError)
  })
})
