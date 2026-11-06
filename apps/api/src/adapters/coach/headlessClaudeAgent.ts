import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  COMMENT_PROMPT,
  commentText,
  questionText,
  SYSTEM_PROMPT,
  type CancelSignal,
  type ClientStatus,
  type CoachAgent,
  type CoachEvent,
  type CoachRequest,
  type CoachTool,
  type CommentRequest,
} from '@chessy/coach'
import type { CoachRuns } from './mcp'

/** A started process, as the agent uses it. */
export interface ProcessRun {
  /** Standard output, a line at a time. */
  lines: AsyncIterable<string>
  exited: Promise<number>
  stderr: Promise<string>
  kill(): void
}

export type RunProcess = (
  command: string,
  args: string[],
  options: { cwd: string; env: Record<string, string | undefined> },
) => ProcessRun

export interface HeadlessClaudeOptions {
  /** The `claude` executable. */
  command?: string
  /** Model alias or id for Claude Code (e.g. "opus"); its own default otherwise. */
  model?: string
  /** Where the coach's tools are served over MCP, for a run's token. */
  mcpUrl: (token: string) => string
  runs: CoachRuns
  tools: CoachTool[]
  run?: RunProcess
}

/** What a run of Claude Code gets on top of what every run does. */
interface ClaudeRun {
  prompt: string
  system: string
  extraArgs: string[]
  signal?: CancelSignal
}

/** How long a status check is believed (it starts a process). */
const STATUS_TTL_MS = 60_000
const MCP_SERVER = 'chessy'

/**
 * The coach on Claude Code in headless mode (`claude -p`), on the user's Claude subscription.
 * Claude Code runs its own tool loop; it gets only our tools, over MCP (no shell, no files: its
 * built-in tools are off), works in an empty folder, and keeps each conversation as a session.
 * A comment during a game runs without our tools as well.
 */
export class HeadlessClaudeAgent implements CoachAgent {
  readonly id = 'claude-headless'
  readonly label = 'Claude Code (your subscription)'
  private readonly options: HeadlessClaudeOptions
  private readonly run: RunProcess
  private readonly command: string
  private readonly sessions = new Set<string>()
  private workdir: string | undefined
  private checked: { at: number; status: Promise<ClientStatus> } | undefined

  constructor(options: HeadlessClaudeOptions) {
    this.options = options
    this.command = options.command ?? 'claude'
    this.run = options.run ?? spawnProcess
  }

  /** Whether Claude Code is installed (`claude --version`). */
  status(): Promise<ClientStatus> {
    if (this.checked && Date.now() - this.checked.at < STATUS_TTL_MS) return this.checked.status
    const status = (async (): Promise<ClientStatus> => {
      try {
        const child = this.run(this.command, ['--version'], { cwd: tmpdir(), env: childEnv() })
        if ((await child.exited) === 0) return { available: true }
      } catch {
        // Not found: below.
      }
      return { available: false, reason: `Claude Code not found (${this.command})` }
    })()
    this.checked = { at: Date.now(), status }
    return status
  }

  /** Never throws: failures end the answer with an error event (a cancel ends it silently). */
  async answer(request: CoachRequest, onEvent: (event: CoachEvent) => void): Promise<void> {
    const { runs, tools, mcpUrl } = this.options
    const token = runs.start(onEvent, request.context)
    const resume = this.sessions.has(request.conversationId)
    try {
      const finished = await this.runClaude(
        {
          prompt: questionText(request.question, request.context),
          system: SYSTEM_PROMPT,
          // Only ours, over MCP, all of them allowed without asking.
          extraArgs: [
            '--mcp-config',
            JSON.stringify({ mcpServers: { [MCP_SERVER]: { type: 'http', url: mcpUrl(token) } } }),
            '--allowedTools',
            tools.map((tool) => `mcp__${MCP_SERVER}__${tool.name}`).join(','),
            ...(resume
              ? ['--resume', request.conversationId]
              : ['--session-id', request.conversationId]),
          ],
          ...(request.signal && { signal: request.signal }),
        },
        onEvent,
      )
      if (finished) this.sessions.add(request.conversationId)
    } finally {
      runs.end(token)
    }
  }

  /**
   * No run token, no MCP server and nothing allowed: Claude Code has no tool to call here, and
   * with no session kept the comment stays out of every conversation.
   */
  async comment({ signal, ...move }: CommentRequest): Promise<string> {
    let text = ''
    let failure: string | undefined
    await this.runClaude(
      {
        prompt: commentText(move),
        system: COMMENT_PROMPT,
        extraArgs: ['--no-session-persistence'],
        ...(signal && { signal }),
      },
      (event) => {
        if (event.type === 'text') text += event.delta
        if (event.type === 'error') failure = event.message
      },
    )
    if (failure !== undefined) throw new Error(failure)
    if (!text.trim()) throw new Error('No comment')
    return text.trim()
  }

  /**
   * One run of Claude Code, its output as events. Never throws, and a cancel ends it silently;
   * resolves to whether it ended cleanly. Its built-in tools are off in every run, and only MCP
   * servers in `extraArgs` count.
   */
  private async runClaude(
    { prompt, system, extraArgs, signal }: ClaudeRun,
    onEvent: (event: CoachEvent) => void,
  ): Promise<boolean> {
    const { model } = this.options
    const args = [
      '-p',
      prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--system-prompt',
      system,
      '--tools',
      '',
      '--strict-mcp-config',
      '--permission-mode',
      'dontAsk',
      '--disable-slash-commands',
      ...extraArgs,
      ...(model ? ['--model', model] : []),
    ]
    let child: ProcessRun
    try {
      child = this.run(this.command, args, { cwd: this.emptyFolder(), env: childEnv() })
    } catch (error) {
      onEvent({ type: 'error', message: `Could not start Claude Code: ${String(error)}` })
      return false
    }
    const cancel = () => child.kill()
    if (signal instanceof AbortSignal) signal.addEventListener('abort', cancel, { once: true })

    const toolNames = new Map<string, string>()
    let finished = false
    try {
      for await (const line of child.lines) {
        const event = parseLine(line)
        if (!event) continue
        for (const coachEvent of translate(event, toolNames)) {
          if (coachEvent.type === 'done' || coachEvent.type === 'error') finished = true
          onEvent(coachEvent)
        }
      }
      const code = await child.exited
      if (signal?.aborted) return false
      if (!finished) {
        const stderr = (await child.stderr).trim().split('\n').slice(-3).join(' ')
        onEvent({
          type: 'error',
          message: `Claude Code stopped (exit ${code}): ${stderr || 'no output'}`,
        })
        return false
      }
      return code === 0
    } finally {
      if (signal instanceof AbortSignal) signal.removeEventListener('abort', cancel)
    }
  }

  /** An empty folder to run in: no project files, no CLAUDE.md for Claude Code to pick up. */
  private emptyFolder(): string {
    this.workdir ??= mkdtempSync(join(tmpdir(), 'chessy-coach-'))
    return this.workdir
  }
}

/** One line of Claude Code's stream-json output (only what we read). */
type StreamLine =
  | { type: 'stream_event'; event: { type: string; delta?: { type: string; text?: string } } }
  | {
      type: 'assistant'
      message: { content: { type: string; id?: string; name?: string; input?: unknown }[] }
    }
  | {
      type: 'user'
      message: { content: { type: string; tool_use_id?: string; is_error?: boolean }[] | string }
    }
  | {
      type: 'result'
      is_error?: boolean
      result?: string
      usage?: {
        input_tokens?: number
        output_tokens?: number
        cache_read_input_tokens?: number
        cache_creation_input_tokens?: number
      }
    }
  | { type: string }

function parseLine(line: string): StreamLine | undefined {
  try {
    return JSON.parse(line) as StreamLine
  } catch {
    return undefined
  }
}

/** Our events for one line: text pieces, tool use, the end. */
function translate(line: StreamLine, toolNames: Map<string, string>): CoachEvent[] {
  if (line.type === 'stream_event' && 'event' in line) {
    const { delta } = line.event
    return line.event.type === 'content_block_delta' && delta?.type === 'text_delta' && delta.text
      ? [{ type: 'text', delta: delta.text }]
      : []
  }
  if (line.type === 'assistant' && 'message' in line) {
    return line.message.content.flatMap((block): CoachEvent[] => {
      if (block.type !== 'tool_use' || !block.name) return []
      const name = block.name.replace(`mcp__${MCP_SERVER}__`, '')
      if (block.id) toolNames.set(block.id, name)
      return [{ type: 'tool', name, input: block.input }]
    })
  }
  if (line.type === 'user' && 'message' in line && Array.isArray(line.message.content)) {
    return line.message.content.flatMap((block): CoachEvent[] =>
      block.type === 'tool_result' && block.tool_use_id
        ? [
            {
              type: 'tool_result',
              name: toolNames.get(block.tool_use_id) ?? 'tool',
              ok: !block.is_error,
            },
          ]
        : [],
    )
  }
  if (line.type === 'result' && 'usage' in line) {
    if (line.is_error) return [{ type: 'error', message: line.result || 'Claude Code failed' }]
    const usage = line.usage ?? {}
    return [
      {
        type: 'done',
        usage: {
          inputTokens:
            (usage.input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0),
          outputTokens: usage.output_tokens ?? 0,
        },
      },
    ]
  }
  return []
}

/**
 * The environment for Claude Code, without an API key: it should run on the user's
 * subscription, not bill the key the API itself uses (Bun loads apps/api/.env).
 */
function childEnv(): Record<string, string | undefined> {
  const { ANTHROPIC_API_KEY: _key, ANTHROPIC_AUTH_TOKEN: _token, ...env } = process.env
  return env
}

const spawnProcess: RunProcess = (command, args, { cwd, env }) => {
  const child = Bun.spawn([command, ...args], {
    cwd,
    env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return {
    lines: readLines(child.stdout),
    exited: child.exited,
    stderr: new Response(child.stderr).text(),
    kill: () => child.kill(),
  }
}

async function* readLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const bytes of stream) {
    buffer += decoder.decode(bytes, { stream: true })
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      yield buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
    }
  }
  if (buffer) yield buffer
}
