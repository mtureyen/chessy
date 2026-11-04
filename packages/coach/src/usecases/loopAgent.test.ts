import { describe, expect, it } from 'vitest'
import { InMemoryConversationStore } from '../adapters/inMemoryConversationStore'
import type { CoachEvent } from '../domain/messages'
import type { LlmClient } from '../ports/llmClient'
import { scriptedClient } from '../testing'
import { LoopAgent } from './loopAgent'

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
})
