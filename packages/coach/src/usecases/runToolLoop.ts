import type {
  CancelSignal,
  ChatMessage,
  CoachEvent,
  ToolCall,
  ToolResult,
  Usage,
} from '../domain/messages'
import type { CoachContext } from '../domain/prompt'
import type { CoachTool } from '../domain/tools'
import type { LlmClient } from '../ports/llmClient'

/** Model turns with tools per answer; the last one gets no tools, so it has to answer. */
export const MAX_TOOL_ROUNDS = 6

/** The user cancelled the answer. */
export class CoachCancelledError extends Error {
  constructor() {
    super('The coach stopped answering')
    this.name = 'CoachCancelledError'
  }
}

/**
 * The coach's tool loop, the same for every provider: ask the model, run the tools it calls
 * (inputs checked against their schemas first), hand back the results, until it answers.
 * Appends every turn to `messages`; reports text, tool use and drawings through `onEvent`.
 * Ends early, without running tools, on a refusal or a tool call cut off at max tokens.
 * Tools get `context`, the situation the question was asked in.
 */
export async function runToolLoop(
  client: LlmClient,
  {
    system,
    messages,
    tools,
    context = {},
    maxRounds = MAX_TOOL_ROUNDS,
    signal,
  }: {
    system: string
    messages: ChatMessage[]
    tools: CoachTool[]
    context?: CoachContext
    maxRounds?: number
    signal?: CancelSignal
  },
  onEvent: (event: CoachEvent) => void,
): Promise<{ usage: Usage }> {
  const usage: Usage = { inputTokens: 0, outputTokens: 0 }
  for (let round = 0; ; round++) {
    if (signal?.aborted) throw new CoachCancelledError()
    const last = round >= maxRounds
    const turn = await client.turn(
      { system, messages, tools: last ? [] : tools, ...(signal && { signal }) },
      (delta) => onEvent({ type: 'text', delta }),
    )
    usage.inputTokens += turn.usage.inputTokens
    usage.outputTokens += turn.usage.outputTokens
    // A tool call cut off at the token limit is never run, so it must not stay in the
    // conversation either: providers reject a call without its result, and every later
    // question in this conversation would fail.
    const cut = turn.stop === 'max_tokens' && turn.toolCalls.length > 0
    messages.push(
      cut
        ? { role: 'assistant', text: turn.text || 'The answer was cut off.', toolCalls: [] }
        : {
            role: 'assistant',
            text: turn.text,
            toolCalls: turn.toolCalls,
            ...(turn.providerState !== undefined && { providerState: turn.providerState }),
          },
    )
    if (turn.stop === 'refusal') {
      onEvent({ type: 'error', message: 'The model declined to answer this.' })
      return { usage }
    }
    if (turn.toolCalls.length === 0) return { usage }
    if (turn.stop === 'max_tokens') {
      onEvent({ type: 'error', message: 'The answer was cut off while calling a tool.' })
      return { usage }
    }
    if (signal?.aborted) throw new CoachCancelledError()
    const results = await Promise.all(
      turn.toolCalls.map((call) => runTool(call, tools, context, onEvent)),
    )
    messages.push({ role: 'tool', results })
  }
}

async function runTool(
  call: ToolCall,
  tools: CoachTool[],
  context: CoachContext,
  onEvent: (event: CoachEvent) => void,
): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === call.name)
  onEvent({ type: 'tool', name: call.name, input: call.input })
  const fail = (content: string): ToolResult => {
    onEvent({ type: 'tool_result', name: call.name, ok: false })
    return { callId: call.id, content, isError: true }
  }
  if (!tool) return fail(`There is no tool named ${call.name}.`)
  const input = tool.parse(call.input)
  if (!input.ok) return fail(`Invalid input: ${input.error}`)
  try {
    const output = await tool.run(input.value, context)
    if (output.board) onEvent({ type: 'board', drawing: output.board })
    onEvent({ type: 'tool_result', name: call.name, ok: true })
    return { callId: call.id, content: output.content }
  } catch (error) {
    return fail(`The tool failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
