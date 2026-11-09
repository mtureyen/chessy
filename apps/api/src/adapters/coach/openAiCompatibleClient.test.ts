import { llmClientContract, type ScriptedTurn } from '@pawnia/coach/testing'
import { describe, expect, it } from 'vitest'
import { OpenAiCompatibleClient } from './openAiCompatibleClient'

type Body = { model: string; messages: Record<string, unknown>[]; tools?: unknown[] }

/**
 * The chat-completions API as server-sent events, playing back scripted turns. `whole`: tool
 * calls in one chunk each and finish "stop" (as Ollama does); otherwise split into pieces.
 */
function fakeServer(script: ScriptedTurn[], { whole = false, models = ['qwen3:14b'] } = {}) {
  const requests: { body?: Body; headers: Record<string, string> }[] = []
  let next = 0
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    if (url.endsWith('/models')) {
      requests.push({ headers })
      return Response.json({ object: 'list', data: models.map((id) => ({ id, object: 'model' })) })
    }
    const body = JSON.parse(String(init?.body)) as Body
    requests.push({ body, headers })
    const turn = script[next++] ?? { text: '' }
    const chunks: unknown[] = []
    for (const word of (turn.text ?? '').split(/(?<= )/)) {
      if (word) chunks.push({ choices: [{ index: 0, delta: { content: word } }] })
    }
    for (const [index, call] of (turn.toolCalls ?? []).entries()) {
      const args = JSON.stringify(call.input)
      const id = `call_${next}_${index}`
      if (whole) {
        chunks.push({
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index, id, type: 'function', function: { name: call.name, arguments: args } },
                ],
              },
            },
          ],
        })
      } else {
        chunks.push({
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index, id, type: 'function', function: { name: call.name, arguments: '' } },
                ],
              },
            },
          ],
        })
        for (let i = 0; i < args.length; i += 4) {
          chunks.push({
            choices: [
              {
                index: 0,
                delta: { tool_calls: [{ index, function: { arguments: args.slice(i, i + 4) } }] },
              },
            ],
          })
        }
      }
    }
    const finish = turn.toolCalls?.length && !whole ? 'tool_calls' : 'stop'
    chunks.push({ choices: [{ index: 0, delta: {}, finish_reason: finish }] })
    chunks.push({ choices: [], usage: { prompt_tokens: 30, completion_tokens: 8 } })
    const sse = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
    return new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } })
  }) as typeof globalThis.fetch
  return { fetch, requests }
}

const client = (
  fetch: typeof globalThis.fetch,
  extra: Partial<ConstructorParameters<typeof OpenAiCompatibleClient>[0]> = {},
) =>
  new OpenAiCompatibleClient({
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen3:14b',
    label: 'qwen3:14b (Ollama)',
    fetch,
    ...extra,
  })

const toolResultsIn = (requests: { body?: Body }[]) => [
  ...new Set(
    requests.flatMap((r) =>
      (r.body?.messages ?? []).filter((m) => m.role === 'tool').map((m) => m.content as string),
    ),
  ),
]

llmClientContract('OpenAI-compatible (tool calls in pieces)', (script) => {
  const { fetch, requests } = fakeServer(script)
  return { client: client(fetch), sentToolResults: () => toolResultsIn(requests) }
})

llmClientContract('OpenAI-compatible (tool calls whole, as Ollama sends them)', (script) => {
  const { fetch, requests } = fakeServer(script, { whole: true })
  return { client: client(fetch), sentToolResults: () => toolResultsIn(requests) }
})

describe('OpenAiCompatibleClient', () => {
  it('sends the system prompt, tools as functions, tool calls and results in OpenAI shape', async () => {
    const { fetch, requests } = fakeServer([{ text: 'ok' }])
    await client(fetch, { apiKey: 'sk-test' }).turn(
      {
        system: 'Rules.',
        messages: [
          { role: 'user', text: 'Hi' },
          {
            role: 'assistant',
            text: '',
            toolCalls: [{ id: 'c1', name: 'echo', input: { value: 'e4' } }],
          },
          { role: 'tool', results: [{ callId: 'c1', content: 'bad', isError: true }] },
        ],
        tools: [],
      },
      () => {},
    )
    const { body, headers } = requests[0]!
    expect(headers.Authorization).toBe('Bearer sk-test')
    expect(body!.tools).toBeUndefined()
    expect(body!.messages).toEqual([
      { role: 'system', content: 'Rules.' },
      { role: 'user', content: 'Hi' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'echo', arguments: '{"value":"e4"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: 'Error: bad' },
    ])
  })

  it('reports usage, and hands broken tool arguments on for the tool check to reject', async () => {
    const fetch = (async () =>
      new Response(
        [
          {
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    { index: 0, id: 'x', function: { name: 'echo', arguments: '{"value": ' } },
                  ],
                },
              },
            ],
          },
          {
            choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
            usage: { prompt_tokens: 5, completion_tokens: 2 },
          },
        ]
          .map((c) => `data: ${JSON.stringify(c)}\n\n`)
          .join('') + 'data: [DONE]\n\n',
      )) as unknown as typeof globalThis.fetch
    const turn = await client(fetch).turn(
      { system: 's', messages: [{ role: 'user', text: '?' }], tools: [] },
      () => {},
    )
    expect(turn.toolCalls).toEqual([{ id: 'x', name: 'echo', input: '{"value": ' }])
    expect(turn.usage).toEqual({ inputTokens: 5, outputTokens: 2 })
  })

  it('says why it can’t answer: server down, model missing, key rejected', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof globalThis.fetch
    expect(await client(down, { unreachableHint: 'is Ollama running?' }).status()).toEqual({
      available: false,
      reason: "Can't reach http://localhost:11434/v1 (is Ollama running?)",
    })
    const { fetch } = fakeServer([], { models: ['llama3.1:8b'] })
    expect(
      await client(fetch, { missingModelHint: (m) => `Install it: ollama pull ${m}` }).status(),
    ).toEqual({ available: false, reason: 'Install it: ollama pull qwen3:14b' })
    expect(await client(fakeServer([]).fetch).status()).toEqual({ available: true })
    const rejected = (async () =>
      new Response('no', { status: 401 })) as unknown as typeof globalThis.fetch
    expect((await client(rejected).status()).available).toBe(false)
  })
})
