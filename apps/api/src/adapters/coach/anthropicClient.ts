import Anthropic from '@anthropic-ai/sdk'
import type {
  CancelSignal,
  ChatMessage,
  ClientStatus,
  CoachTool,
  LlmClient,
  LlmTurn,
  TurnStop,
} from '@pawnia/coach'

export interface AnthropicClientOptions {
  /** A configured SDK client; by default one that reads ANTHROPIC_API_KEY / the `ant` login. */
  client?: Anthropic
  model?: string
  /** e.g. "Claude Opus 5.5". */
  label?: string
  /** How hard the model thinks: low … max (Claude Opus 5.5 defaults to medium). */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  maxTokens?: number
}

/** How long a status check is believed (it asks the API, so not on every request). */
const STATUS_TTL_MS = 60_000
/** Re-issued turns whose tool input arrived as JSON the SDK could not parse at all. */
const JSON_RETRIES = 2

/**
 * Claude through the Anthropic API. What only Claude needs stays in here: the assistant's
 * content blocks (thinking included) go back unchanged as providerState, the system prompt is
 * cached, and a declined request is re-run server-side on Anthropic's recommended fallback.
 */
export class AnthropicClient implements LlmClient {
  readonly name: string
  private readonly client: Anthropic
  private readonly model: string
  private readonly effort: NonNullable<AnthropicClientOptions['effort']>
  private readonly maxTokens: number
  private checked: { at: number; status: Promise<ClientStatus> } | undefined

  constructor({
    client,
    model = 'claude-opus-5-5',
    label = 'Claude Opus 5.5',
    effort = 'medium',
    maxTokens = 16_000,
  }: AnthropicClientOptions = {}) {
    this.client = client ?? new Anthropic()
    this.model = model
    this.name = label
    this.effort = effort
    this.maxTokens = maxTokens
  }

  /** Whether the API takes our credentials: a models lookup, which costs no tokens. */
  status(): Promise<ClientStatus> {
    if (this.checked && Date.now() - this.checked.at < STATUS_TTL_MS) return this.checked.status
    const status = this.client.models
      .retrieve(this.model)
      .then((): ClientStatus => ({ available: true }))
      .catch((error: unknown): ClientStatus => ({
        available: false,
        reason:
          error instanceof Anthropic.AuthenticationError
            ? 'The Anthropic API key was rejected: check it in Settings → Coach'
            : error instanceof Anthropic.AnthropicError
              ? error.message
              : // A plain Error before any request: the SDK found no credentials at all.
                'No Anthropic API key: enter one in Settings → Coach',
      }))
    this.checked = { at: Date.now(), status }
    return status
  }

  async turn(
    request: { system: string; messages: ChatMessage[]; tools: CoachTool[]; signal?: CancelSignal },
    onText: (delta: string) => void,
  ): Promise<LlmTurn> {
    for (let attempt = 0; ; attempt++) {
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: this.maxTokens,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: this.effort },
          system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
          messages: request.messages.flatMap(toAnthropic),
          tools: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
            // Inputs stream as they are written; runToolLoop checks them against the schema.
            eager_input_streaming: true,
          })),
        },
        abortSignal(request.signal) ? { signal: abortSignal(request.signal)! } : undefined,
      )
      stream.on('text', onText)
      let message: Anthropic.Beta.BetaMessage
      try {
        message = await stream.finalMessage()
      } catch (error) {
        // Only a tool input that isn't JSON at all is worth re-issuing; API errors go up.
        if (error instanceof Anthropic.APIError || attempt >= JSON_RETRIES) throw error
        continue
      }
      return fromAnthropic(message)
    }
  }
}

function toAnthropic(message: ChatMessage): Anthropic.Beta.BetaMessageParam[] {
  switch (message.role) {
    case 'user':
      return [{ role: 'user', content: message.text }]
    case 'assistant':
      // Claude's own blocks, unchanged (thinking blocks must come back as they were).
      if (Array.isArray(message.providerState)) {
        return [
          {
            role: 'assistant',
            content: message.providerState as Anthropic.Beta.BetaContentBlockParam[],
          },
        ]
      }
      return [
        {
          role: 'assistant',
          content: [
            ...(message.text ? [{ type: 'text' as const, text: message.text }] : []),
            ...message.toolCalls.map((call) => ({
              type: 'tool_use' as const,
              id: call.id,
              name: call.name,
              input: call.input,
            })),
          ],
        },
      ]
    case 'tool':
      return [
        {
          role: 'user',
          content: message.results.map((result) => ({
            type: 'tool_result' as const,
            tool_use_id: result.callId,
            content: result.content,
            ...(result.isError && { is_error: true }),
          })),
        },
      ]
  }
}

function fromAnthropic(message: Anthropic.Beta.BetaMessage): LlmTurn {
  const text = message.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('')
  const toolCalls = message.content.flatMap((block) =>
    block.type === 'tool_use' ? [{ id: block.id, name: block.name, input: block.input }] : [],
  )
  const { usage } = message
  return {
    text,
    toolCalls,
    stop: stopOf(message.stop_reason),
    providerState: message.content,
    usage: {
      inputTokens:
        usage.input_tokens +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0),
      outputTokens: usage.output_tokens,
    },
  }
}

function stopOf(reason: string | null): TurnStop {
  if (reason === 'tool_use') return 'tool_use'
  if (reason === 'max_tokens') return 'max_tokens'
  if (reason === 'refusal') return 'refusal'
  return 'end'
}

/** The route hands over the request's AbortSignal; anything else can only be polled. */
function abortSignal(signal: CancelSignal | undefined): AbortSignal | undefined {
  return signal instanceof AbortSignal ? signal : undefined
}
