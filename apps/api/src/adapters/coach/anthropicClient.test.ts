import Anthropic from '@anthropic-ai/sdk'
import { llmClientContract, type ScriptedTurn } from '@pawnia/coach/testing'
import { describe, expect, it } from 'vitest'
import { AnthropicClient } from './anthropicClient'

/** The Messages API as server-sent events, playing back scripted turns; records the requests. */
function fakeAnthropic(script: ScriptedTurn[]) {
  const requests: Record<string, unknown>[] = []
  let next = 0
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    )
    if (url.pathname.startsWith('/v1/models/')) {
      return Response.json({ id: url.pathname.split('/').pop(), type: 'model' })
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    requests.push(body)
    const turn = script[next++] ?? { text: '' }
    const events: [string, unknown][] = [
      [
        'message_start',
        {
          type: 'message_start',
          message: {
            id: `msg_${next}`,
            type: 'message',
            role: 'assistant',
            model: body.model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 12, output_tokens: 0 },
          },
        },
      ],
    ]
    let index = 0
    if (turn.text) {
      events.push([
        'content_block_start',
        { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
      ])
      for (const word of turn.text.split(/(?<= )/)) {
        events.push([
          'content_block_delta',
          { type: 'content_block_delta', index, delta: { type: 'text_delta', text: word } },
        ])
      }
      events.push(['content_block_stop', { type: 'content_block_stop', index }])
      index++
    }
    for (const call of turn.toolCalls ?? []) {
      events.push([
        'content_block_start',
        {
          type: 'content_block_start',
          index,
          content_block: {
            type: 'tool_use',
            id: `toolu_${next}_${index}`,
            name: call.name,
            input: {},
          },
        },
      ])
      events.push([
        'content_block_delta',
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) },
        },
      ])
      events.push(['content_block_stop', { type: 'content_block_stop', index }])
      index++
    }
    const stop = turn.toolCalls?.length ? 'tool_use' : 'end_turn'
    events.push([
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: stop, stop_sequence: null },
        usage: { output_tokens: 7 },
      },
    ])
    events.push(['message_stop', { type: 'message_stop' }])
    const sse = events
      .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      .join('')
    return new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } })
  }
  const sdk = new Anthropic({
    apiKey: 'test-key',
    baseURL: 'http://anthropic.test',
    fetch,
    maxRetries: 0,
  })
  return { sdk, requests }
}

function toolResultsIn(requests: Record<string, unknown>[]): string[] {
  return requests.flatMap((request) =>
    (request.messages as { role: string; content: unknown }[]).flatMap((message) =>
      Array.isArray(message.content)
        ? (message.content as { type: string; content?: string }[])
            .filter((block) => block.type === 'tool_result')
            .map((block) => block.content!)
        : [],
    ),
  )
}

llmClientContract('Anthropic (fake API)', (script) => {
  const { sdk, requests } = fakeAnthropic(script)
  const client = new AnthropicClient({ client: sdk })
  // A tool result goes back in every later request; count each once.
  return { client, sentToolResults: () => [...new Set(toolResultsIn(requests))] }
})

describe('AnthropicClient', () => {
  it('asks with a cached system prompt, the default fallback and Claude’s own blocks back', async () => {
    const { sdk, requests } = fakeAnthropic([
      { toolCalls: [{ name: 'echo', input: { value: 'e4' } }] },
      { text: 'Fine.' },
    ])
    const client = new AnthropicClient({ client: sdk, effort: 'low' })
    const first = await client.turn(
      { system: 'Rules.', messages: [{ role: 'user', text: 'Hi' }], tools: [] },
      () => {},
    )
    await client.turn(
      {
        system: 'Rules.',
        messages: [
          { role: 'user', text: 'Hi' },
          {
            role: 'assistant',
            text: first.text,
            toolCalls: first.toolCalls,
            providerState: first.providerState,
          },
          { role: 'tool', results: [{ callId: first.toolCalls[0]!.id, content: 'ok' }] },
        ],
        tools: [],
      },
      () => {},
    )
    expect(requests[0]).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: 'Rules.', cache_control: { type: 'ephemeral' } }],
    })
    const messages = requests[1]!.messages as { role: string; content: unknown }[]
    expect(messages[1]).toEqual({ role: 'assistant', content: first.providerState })
    expect(first.usage).toEqual({ inputTokens: 12, outputTokens: 7 })
  })

  it('reports missing credentials before any request', async () => {
    const sdk = new Anthropic({ apiKey: null, baseURL: 'http://anthropic.test', maxRetries: 0 })
    expect(await new AnthropicClient({ client: sdk }).status()).toEqual({
      available: false,
      reason: 'No Anthropic API key: enter one in Settings → Coach',
    })
  })

  it('reports a rejected key as unavailable', async () => {
    const fetch = async () =>
      Response.json(
        { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
        { status: 401 },
      )
    const sdk = new Anthropic({
      apiKey: 'wrong',
      baseURL: 'http://anthropic.test',
      fetch,
      maxRetries: 0,
    })
    expect(await new AnthropicClient({ client: sdk }).status()).toEqual({
      available: false,
      reason: 'The Anthropic API key was rejected: check it in Settings → Coach',
    })
  })
})
