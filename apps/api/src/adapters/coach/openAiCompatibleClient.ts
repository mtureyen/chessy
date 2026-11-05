import type {
  CancelSignal,
  ChatMessage,
  ClientStatus,
  CoachTool,
  LlmClient,
  LlmTurn,
  ToolCall,
  TurnStop,
} from '@chessy/coach'

export interface OpenAiCompatibleOptions {
  /** The API root, e.g. "http://localhost:11434/v1" (Ollama) or "https://api.openai.com/v1". */
  baseUrl: string
  model: string
  /** e.g. "qwen3:14b (Ollama)". */
  label: string
  /** Sent as a bearer token; local servers usually need none. */
  apiKey?: string
  /** What to tell the user when the server can't be reached, e.g. "Is Ollama running?". */
  unreachableHint?: string
  /** What to tell the user when the model is missing, e.g. "ollama pull <model>". */
  missingModelHint?: (model: string) => string
  fetch?: typeof fetch
}

/** One streamed chunk of a chat completion (only the fields we use). */
interface Chunk {
  choices?: {
    delta?: {
      content?: string | null
      tool_calls?: {
        index: number
        id?: string
        function?: { name?: string; arguments?: string }
      }[]
    }
    finish_reason?: string | null
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null
}

/**
 * Any model behind the OpenAI chat-completions API: Ollama, LM Studio, llama.cpp, vLLM locally;
 * OpenAI, OpenRouter, Groq, Mistral, DeepSeek and others in the cloud. Plain HTTP, streamed.
 */
export class OpenAiCompatibleClient implements LlmClient {
  readonly name: string
  private readonly options: OpenAiCompatibleOptions
  private readonly fetch: typeof fetch

  constructor(options: OpenAiCompatibleOptions) {
    this.options = options
    this.name = options.label
    this.fetch = options.fetch ?? fetch
  }

  /** Reachable, and the model is among the server's models. */
  async status(): Promise<ClientStatus> {
    const { baseUrl, model, unreachableHint, missingModelHint } = this.options
    let res: Response
    try {
      res = await this.fetch(`${baseUrl}/models`, { headers: this.headers() })
    } catch {
      return {
        available: false,
        reason: `Can't reach ${baseUrl}${unreachableHint ? ` (${unreachableHint})` : ''}`,
      }
    }
    if (res.status === 401 || res.status === 403) {
      return { available: false, reason: `${baseUrl} rejected the API key` }
    }
    if (!res.ok) return { available: false, reason: `${baseUrl}: HTTP ${res.status}` }
    const { data = [] } = (await res.json()) as { data?: { id: string }[] }
    if (!data.some((entry) => entry.id === model)) {
      return {
        available: false,
        reason: missingModelHint?.(model) ?? `Model ${model} is not available at ${baseUrl}`,
      }
    }
    return { available: true }
  }

  async turn(
    request: { system: string; messages: ChatMessage[]; tools: CoachTool[]; signal?: CancelSignal },
    onText: (delta: string) => void,
  ): Promise<LlmTurn> {
    const body = {
      model: this.options.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: request.system },
        ...request.messages.flatMap(toOpenAi),
      ],
      ...(request.tools.length > 0 && {
        tools: request.tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        })),
      }),
    }
    const res = await this.fetch(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...(request.signal instanceof AbortSignal && { signal: request.signal }),
    })
    if (!res.ok || !res.body) {
      throw new Error(`${this.name}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    }

    let text = ''
    let finish: string | null | undefined
    const calls: { id: string; name: string; arguments: string }[] = []
    const usage = { inputTokens: 0, outputTokens: 0 }
    for await (const chunk of serverSentData(res.body)) {
      const parsed = JSON.parse(chunk) as Chunk
      if (parsed.usage) {
        usage.inputTokens = parsed.usage.prompt_tokens ?? 0
        usage.outputTokens = parsed.usage.completion_tokens ?? 0
      }
      const choice = parsed.choices?.[0]
      if (!choice) continue
      const delta = choice.delta
      if (delta?.content) {
        text += delta.content
        onText(delta.content)
      }
      // Tool calls arrive in pieces per index (some servers send each one whole).
      for (const piece of delta?.tool_calls ?? []) {
        const call = (calls[piece.index] ??= { id: '', name: '', arguments: '' })
        if (piece.id) call.id = piece.id
        if (piece.function?.name) call.name += piece.function.name
        if (piece.function?.arguments) call.arguments += piece.function.arguments
      }
      if (choice.finish_reason) finish = choice.finish_reason
    }

    const toolCalls: ToolCall[] = calls.filter(Boolean).map((call, index) => ({
      id: call.id || `call_${index}`,
      name: call.name,
      input: parseArguments(call.arguments),
    }))
    return { text, toolCalls, stop: stopOf(finish, toolCalls.length > 0), usage }
  }

  private headers(): Record<string, string> {
    return this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}
  }
}

function toOpenAi(message: ChatMessage): Record<string, unknown>[] {
  switch (message.role) {
    case 'user':
      return [{ role: 'user', content: message.text }]
    case 'assistant':
      return [
        {
          role: 'assistant',
          content: message.text || null,
          ...(message.toolCalls.length > 0 && {
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: 'function',
              function: { name: call.name, arguments: JSON.stringify(call.input) },
            })),
          }),
        },
      ]
    case 'tool':
      return message.results.map((result) => ({
        role: 'tool',
        tool_call_id: result.callId,
        content: result.isError ? `Error: ${result.content}` : result.content,
      }))
  }
}

/** Arguments are a JSON string; anything else goes to the tool as is and fails its check. */
function parseArguments(json: string): unknown {
  if (json.trim() === '') return {}
  try {
    return JSON.parse(json)
  } catch {
    return json
  }
}

function stopOf(finish: string | null | undefined, hasToolCalls: boolean): TurnStop {
  if (finish === 'length') return 'max_tokens'
  if (finish === 'content_filter') return 'refusal'
  // Some servers end a tool call with "stop": the calls themselves count.
  if (finish === 'tool_calls' || hasToolCalls) return 'tool_use'
  return 'end'
}

/** The `data:` payloads of a server-sent event stream, up to `[DONE]`. */
async function* serverSentData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true })
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice('data:'.length).trim()
      if (data === '[DONE]') return
      if (data) yield data
    }
  }
}
