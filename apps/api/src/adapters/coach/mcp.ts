import type { CoachEvent, CoachTool } from '@chessy/coach'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

/**
 * Answers in progress by an agent that calls our tools over MCP (Claude Code), each under a
 * one-time token in the MCP URL: only a running answer can use the tools, and what a tool draws
 * on the board reaches that answer's stream.
 */
export class CoachRuns {
  private readonly runs = new Map<string, (event: CoachEvent) => void>()

  start(onEvent: (event: CoachEvent) => void): string {
    const token = crypto.randomUUID()
    this.runs.set(token, onEvent)
    return token
  }

  end(token: string): void {
    this.runs.delete(token)
  }

  listener(token: string): ((event: CoachEvent) => void) | undefined {
    return this.runs.get(token)
  }
}

/**
 * The coach's tools as an MCP server (Streamable HTTP, stateless, JSON responses), for a run's
 * token. Inputs are checked against each tool's schema before it runs, as in our own loop.
 */
export async function handleMcpRequest(
  request: Request,
  token: string,
  { tools, runs, version }: { tools: CoachTool[]; runs: CoachRuns; version: string },
): Promise<Response> {
  const onEvent = runs.listener(token)
  if (!onEvent) return new Response('Unknown or finished run', { status: 404 })

  const server = new Server({ name: 'chessy', version }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as { type: 'object' },
    })),
  }))
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const failure = (text: string) => ({
      content: [{ type: 'text' as const, text }],
      isError: true,
    })
    const tool = tools.find((t) => t.name === params.name)
    if (!tool) return failure(`There is no tool named ${params.name}.`)
    const input = tool.parse(params.arguments ?? {})
    if (!input.ok) return failure(`Invalid input: ${input.error}`)
    try {
      const output = await tool.run(input.value)
      if (output.board) onEvent({ type: 'board', drawing: output.board })
      return { content: [{ type: 'text' as const, text: output.content }] }
    } catch (error) {
      return failure(`The tool failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}
