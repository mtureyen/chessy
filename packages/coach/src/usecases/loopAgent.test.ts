import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { InMemoryConversationStore } from '../adapters/inMemoryConversationStore'
import type { CoachEvent } from '../domain/messages'
import { COMMENT_PROMPT, type CommentedMove } from '../domain/prompt'
import { defineTool } from '../domain/tools'
import type { LlmClient } from '../ports/llmClient'
import { echoTool, scriptedClient } from '../testing'
import { LoopAgent } from './loopAgent'

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

describe('LoopAgent', () => {
  it('keeps the conversation, so a follow-up carries the history as the provider left it', async () => {
    const { client, requests } = scriptedClient([
      { text: 'Play Nf3.' },
      { text: 'Because it develops.' },
    ])
    const agent = new LoopAgent({
      id: 'test',
      label: 'Test',
      client,
      tools: [],
      conversations: new InMemoryConversationStore(),
    })
    const events: CoachEvent[] = []
    await agent.answer(
      { conversationId: 'c1', question: 'What now?', context: { fen: 'startpos-fen' } },
      (e) => events.push(e),
    )
    await agent.answer({ conversationId: 'c1', question: 'Why?' }, () => {})

    expect(requests[0]!.messages[0]).toEqual({
      role: 'user',
      text: 'Position on my board (FEN): startpos-fen\n\nWhat now?',
    })
    expect(requests[1]!.messages).toEqual([
      requests[0]!.messages[0],
      { role: 'assistant', text: 'Play Nf3.', toolCalls: [], providerState: { turn: 1 } },
      { role: 'user', text: 'Why?' },
    ])
    expect(events.at(-1)).toEqual({ type: 'done', usage: { inputTokens: 10, outputTokens: 5 } })
  })

  it('ends with an error event when the provider fails, and keeps no half answer', async () => {
    const failing: LlmClient = {
      ...scriptedClient([]).client,
      turn: async () => {
        throw new Error('HTTP 529 overloaded')
      },
    }
    const conversations = new InMemoryConversationStore()
    const agent = new LoopAgent({ id: 't', label: 'T', client: failing, tools: [], conversations })
    const events: CoachEvent[] = []
    await agent.answer({ conversationId: 'c2', question: 'Hi' }, (e) => events.push(e))
    expect(events).toEqual([{ type: 'error', message: 'HTTP 529 overloaded' }])
    expect(await conversations.load('c2')).toBeUndefined()
  })

  describe('comments on a move', () => {
    it('asks once, with the comment rules and the move, and offers no tools', async () => {
      const { client, requests } = scriptedClient([{ text: ' That opened the king. ' }])
      const agent = new LoopAgent({
        id: 't',
        label: 'T',
        client,
        tools: [echoTool],
        conversations: new InMemoryConversationStore(),
      })
      expect(await agent.comment(blunder)).toBe('That opened the king.')
      expect(requests).toHaveLength(1)
      expect(requests[0]!.system).toBe(COMMENT_PROMPT)
      expect(requests[0]!.tools).toEqual([])
      expect(requests[0]!.messages).toEqual([
        {
          role: 'user',
          text: [
            'I play white and just played 2. g4: a blunder.',
            `Position after it (FEN): ${blunder.fen}`,
            'My winning chances went from 45% to 0%.',
            'My opponent can now force mate in 1.',
          ].join('\n'),
        },
      ])
    })

    it('runs no tool, even when the model calls one', async () => {
      const run = vi.fn(async () => ({ content: 'the best move is ...' }))
      const engine = defineTool({
        name: 'evaluate_position',
        description: 'The engine.',
        input: z.object({}),
        run,
      })
      const { client, requests } = scriptedClient([
        { toolCalls: [{ name: 'evaluate_position', input: {} }] },
        { text: 'Play Nf3 now.' },
      ])
      const agent = new LoopAgent({
        id: 't',
        label: 'T',
        client,
        tools: [engine],
        conversations: new InMemoryConversationStore(),
      })
      await expect(agent.comment(blunder)).rejects.toThrow('No comment')
      expect(run).not.toHaveBeenCalled()
      expect(requests).toHaveLength(1)
    })

    it('leaves conversations alone', async () => {
      const conversations = new InMemoryConversationStore()
      const load = vi.spyOn(conversations, 'load')
      const save = vi.spyOn(conversations, 'save')
      const { client } = scriptedClient([{ text: 'Sharp.' }])
      const agent = new LoopAgent({ id: 't', label: 'T', client, tools: [], conversations })
      await agent.comment(blunder)
      expect(load).not.toHaveBeenCalled()
      expect(save).not.toHaveBeenCalled()
    })

    it('throws when the model refuses or says nothing', async () => {
      const refusing: LlmClient = {
        ...scriptedClient([]).client,
        turn: async () => ({
          text: '',
          toolCalls: [],
          stop: 'refusal',
          usage: { inputTokens: 1, outputTokens: 0 },
        }),
      }
      const conversations = new InMemoryConversationStore()
      const agent = new LoopAgent({
        id: 't',
        label: 'T',
        client: refusing,
        tools: [],
        conversations,
      })
      await expect(agent.comment(blunder)).rejects.toThrow('No comment (refusal)')
    })
  })
})
