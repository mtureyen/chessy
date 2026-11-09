import {
  COMMENT_PROMPT,
  commentText,
  defineTool,
  SYSTEM_PROMPT,
  type CoachContext,
  type CoachEvent,
  type CommentedMove,
} from '@pawnia/coach'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { HeadlessClaudeAgent, type ProcessRun, type RunProcess } from './headlessClaudeAgent'
import { CoachRuns, handleMcpRequest } from './mcp'

/** The context each call of the tool saw. */
const drawnIn: CoachContext[] = []
const draw = defineTool({
  name: 'show_on_board',
  description: 'Draws an arrow.',
  input: z.object({ from: z.string(), to: z.string() }),
  run: async ({ from, to }, context) => {
    drawnIn.push(context)
    return { content: 'drawn', board: { arrows: [{ from, to, color: 'green' }], squares: [] } }
  },
})

const line = (value: unknown) => JSON.stringify(value)

/**
 * Plays Claude Code: answers with stream-json lines, and calls a tool through our real MCP
 * endpoint (with the run token from its --mcp-config) the way Claude Code would.
 */
function fakeClaude(runs: CoachRuns, { exitCode = 0, fail = false } = {}) {
  const calls: { args: string[]; env: Record<string, string | undefined> }[] = []
  const killed: boolean[] = []
  const run: RunProcess = (_command, args, { env }) => {
    calls.push({ args, env })
    if (args[0] === '--version') {
      return {
        lines: (async function* () {})(),
        exited: Promise.resolve(0),
        stderr: Promise.resolve(''),
        kill() {},
      }
    }
    const config = JSON.parse(args[args.indexOf('--mcp-config') + 1]!) as {
      mcpServers: { chessy: { url: string } }
    }
    const url = config.mcpServers.chessy.url
    const token = url.split('/').pop()!
    async function* lines() {
      yield line({ type: 'system', subtype: 'init' })
      yield line({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Look: ' } },
      })
      yield line({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 't1',
              name: 'mcp__chessy__show_on_board',
              input: { from: 'e2', to: 'e4' },
            },
          ],
        },
      })
      const res = await handleMcpRequest(
        new Request(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: line({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'show_on_board', arguments: { from: 'e2', to: 'e4' } },
          }),
        }),
        token,
        { tools: [draw], runs, version: 'test' },
      )
      const result = (await res.json()) as { result: { isError?: boolean } }
      yield line({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 't1', is_error: result.result.isError ?? false },
          ],
        },
      })
      yield line({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'e4 takes the centre.' },
        },
      })
      if (fail) {
        yield line({ type: 'result', is_error: true, result: 'Credit balance too low', usage: {} })
      } else if (exitCode === 0) {
        yield line({
          type: 'result',
          is_error: false,
          result: 'Look: e4 takes the centre.',
          usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 20 },
        })
      }
    }
    let kill = () => {}
    const exited = new Promise<number>((resolve) => {
      kill = () => {
        killed.push(true)
        resolve(143)
      }
      setTimeout(() => resolve(exitCode), 20)
    })
    const process: ProcessRun = {
      lines: lines(),
      exited,
      stderr: Promise.resolve('Not logged in · Please run /login'),
      kill,
    }
    return process
  }
  return { run, calls, killed }
}

const agentWith = (runs: CoachRuns, run: RunProcess) =>
  new HeadlessClaudeAgent({
    tools: [draw],
    runs,
    run,
    mcpUrl: (token) => `http://localhost:3000/api/v1/mcp/${token}`,
  })

const blunder: CommentedMove = {
  fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2',
  color: 'white',
  moveNumber: 2,
  san: 'g4',
  verdict: 'blunder',
  winBefore: 45,
  winAfter: 0,
  mateIn: 1,
}

/** Plays Claude Code answering in text only; records how it was started. */
function commentingClaude(output: unknown[], exitCode = 0) {
  const calls: string[][] = []
  const killed: boolean[] = []
  const run: RunProcess = (_command, args) => {
    calls.push(args)
    return {
      lines: (async function* () {
        for (const value of output) yield line(value)
      })(),
      exited: Promise.resolve(exitCode),
      stderr: Promise.resolve('boom'),
      kill: () => killed.push(true),
    }
  }
  return { run, calls, killed }
}

const said = (text: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
})
const ended = { type: 'result', is_error: false, result: 'x', usage: { output_tokens: 3 } }

describe('HeadlessClaudeAgent', () => {
  const previousKey = process.env.ANTHROPIC_API_KEY
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-should-not-reach-claude-code'
  })
  afterEach(() => {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = previousKey
  })

  it('runs Claude Code with only our tools, streams its answer and its drawings', async () => {
    const runs = new CoachRuns()
    const { run, calls } = fakeClaude(runs)
    const events: CoachEvent[] = []
    const conversationId = '1b7e5f8a-6a5c-4d3e-9c1b-2a4f6e8d0c11'
    await agentWith(runs, run).answer(
      { conversationId, question: 'Best move?', context: { fen: 'x' } },
      (e) => events.push(e),
    )

    expect(events).toEqual([
      { type: 'text', delta: 'Look: ' },
      { type: 'tool', name: 'show_on_board', input: { from: 'e2', to: 'e4' } },
      {
        type: 'board',
        drawing: { arrows: [{ from: 'e2', to: 'e4', color: 'green' }], squares: [] },
      },
      { type: 'tool_result', name: 'show_on_board', ok: true },
      { type: 'text', delta: 'e4 takes the centre.' },
      { type: 'done', usage: { inputTokens: 100, outputTokens: 20 } },
    ])
    const { args, env } = calls[0]!
    const flag = (name: string) => args[args.indexOf(name) + 1]
    expect(args[1]).toBe('Position on my board (FEN): x\n\nBest move?')
    expect(flag('--tools')).toBe('')
    expect(flag('--system-prompt')).toBe(SYSTEM_PROMPT)
    expect(flag('--allowedTools')).toBe('mcp__chessy__show_on_board')
    expect(flag('--session-id')).toBe(conversationId)
    expect(args).toContain('--strict-mcp-config')
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    // The tool, called over MCP, saw the situation the question was asked in.
    expect(drawnIn.at(-1)).toEqual({ fen: 'x' })

    // A follow-up resumes the session; the finished run's token no longer opens the tools.
    await agentWith(runs, run).answer({ conversationId, question: 'Why?' }, () => {})
    const token = JSON.parse(flag('--mcp-config')!).mcpServers.chessy.url.split('/').pop()
    expect(runs.run(token)).toBeUndefined()
  })

  it('resumes a conversation it started', async () => {
    const runs = new CoachRuns()
    const { run, calls } = fakeClaude(runs)
    const agent = agentWith(runs, run)
    const conversationId = '2b7e5f8a-6a5c-4d3e-9c1b-2a4f6e8d0c11'
    await agent.answer({ conversationId, question: 'One' }, () => {})
    await agent.answer({ conversationId, question: 'Two' }, () => {})
    const second = calls[1]!.args
    expect(second[second.indexOf('--resume') + 1]).toBe(conversationId)
    expect(second).not.toContain('--session-id')
  })

  it('ends with an error when Claude Code fails or stops early', async () => {
    const runs = new CoachRuns()
    const failing: CoachEvent[] = []
    await agentWith(runs, fakeClaude(runs, { fail: true }).run).answer(
      { conversationId: '3b7e5f8a-6a5c-4d3e-9c1b-2a4f6e8d0c11', question: '?' },
      (e) => failing.push(e),
    )
    expect(failing.at(-1)).toEqual({ type: 'error', message: 'Credit balance too low' })

    const stopped: CoachEvent[] = []
    await agentWith(runs, fakeClaude(runs, { exitCode: 1 }).run).answer(
      { conversationId: '4b7e5f8a-6a5c-4d3e-9c1b-2a4f6e8d0c11', question: '?' },
      (e) => stopped.push(e),
    )
    expect(stopped.at(-1)).toEqual({
      type: 'error',
      message: 'Claude Code stopped (exit 1): Not logged in · Please run /login',
    })
  })

  it('stops Claude Code when the answer is cancelled', async () => {
    const runs = new CoachRuns()
    const { run, killed } = fakeClaude(runs)
    const controller = new AbortController()
    const events: CoachEvent[] = []
    await agentWith(runs, run).answer(
      {
        conversationId: '5b7e5f8a-6a5c-4d3e-9c1b-2a4f6e8d0c11',
        question: '?',
        signal: controller.signal,
      },
      (e) => {
        events.push(e)
        if (e.type === 'tool') controller.abort()
      },
    )
    expect(killed).toEqual([true])
  })

  describe('comments on a move', () => {
    it('starts Claude Code with no tool of any kind to call', async () => {
      const runs = new CoachRuns()
      const start = vi.spyOn(runs, 'start')
      const { run, calls } = commentingClaude([said('That opened '), said('the king.'), ended])
      const comment = await agentWith(runs, run).comment(blunder)

      expect(comment).toBe('That opened the king.')
      const args = calls[0]!
      const flag = (name: string) => args[args.indexOf(name) + 1]
      expect(args[1]).toBe(commentText(blunder))
      expect(flag('--system-prompt')).toBe(COMMENT_PROMPT)
      expect(flag('--tools')).toBe('') // no built-in tools
      expect(args).toContain('--strict-mcp-config') // no MCP server of the user's either
      expect(args).toContain('--no-session-persistence') // nothing left behind
      expect(args).not.toContain('--mcp-config')
      expect(args).not.toContain('--allowedTools')
      expect(flag('--permission-mode')).toBe('dontAsk')
      // Nothing to reach our tools with: no run token exists for it.
      expect(start).not.toHaveBeenCalled()
      expect(args.join(' ')).not.toContain('/api/v1/mcp/')
    })

    it('stays out of the conversations', async () => {
      const runs = new CoachRuns()
      const { run, calls } = commentingClaude([said('Sharp.'), ended])
      const agent = agentWith(runs, run)
      const conversationId = '6b7e5f8a-6a5c-4d3e-9c1b-2a4f6e8d0c11'
      await agent.comment(blunder)
      await agent.comment(blunder)
      for (const args of calls) {
        expect(args).not.toContain('--session-id')
        expect(args).not.toContain('--resume')
      }
      // A chat afterwards still starts as a new session.
      const chat = fakeClaude(runs)
      const chatting = agentWith(runs, chat.run)
      await chatting.answer({ conversationId, question: 'Hi' }, () => {})
      expect(chat.calls[0]!.args).toContain('--session-id')
    })

    it('throws when Claude Code fails, stops early or says nothing', async () => {
      const runs = new CoachRuns()
      const comment = (output: unknown[], code?: number) =>
        agentWith(runs, commentingClaude(output, code).run).comment(blunder)
      await expect(
        comment([{ type: 'result', is_error: true, result: 'Credit balance too low', usage: {} }]),
      ).rejects.toThrow('Credit balance too low')
      await expect(comment([said('Half a')], 1)).rejects.toThrow(
        'Claude Code stopped (exit 1): boom',
      )
      await expect(comment([ended])).rejects.toThrow('No comment')
    })

    it('stops Claude Code when the comment is cancelled', async () => {
      const runs = new CoachRuns()
      const { run, killed } = commentingClaude([said('Sharp.'), ended])
      const controller = new AbortController()
      const running = agentWith(runs, run).comment({ ...blunder, signal: controller.signal })
      controller.abort()
      await running
      expect(killed).toEqual([true])
    })
  })

  it('is available when Claude Code is installed', async () => {
    const runs = new CoachRuns()
    expect(await agentWith(runs, fakeClaude(runs).run).status()).toEqual({ available: true })
    const missing: RunProcess = () => {
      throw new Error('ENOENT')
    }
    expect(await agentWith(runs, missing).status()).toEqual({
      available: false,
      reason: 'Claude Code not found (claude)',
    })
  })
})
