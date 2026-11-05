// Types only: app.ts (and through it the web app's typed client) sees this file, not the MCP
// server behind it.

/** Serves the coach's tools over MCP to an agent that runs its own loop (Claude Code). */
export interface McpEndpoint {
  /** One MCP request (Streamable HTTP) for a running answer's token. */
  handle(request: Request, token: string): Promise<Response>
}
