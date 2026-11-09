import { describe, expect, it } from 'vitest'
import type { ChatMessage } from './messages'
import { FOLLOW_UP_EXCHANGES, followUpText } from './prompt'

const exchange = (n: number): ChatMessage[] => [
  { role: 'user', text: `question ${n}` },
  { role: 'assistant', text: `answer ${n}`, toolCalls: [] },
]

describe('followUpText', () => {
  it('is the question alone at the start of a conversation', () => {
    expect(followUpText([], 'Why Nf3?')).toBe('Why Nf3?')
  })

  it('puts the earlier questions and answers before the question, without tool traffic', () => {
    const earlier: ChatMessage[] = [
      { role: 'user', text: 'Was e4 good?' },
      {
        role: 'assistant',
        text: '',
        toolCalls: [{ id: 't', name: 'evaluate_position', input: {} }],
      },
      { role: 'tool', results: [{ callId: 't', content: '{"score":30}' }] },
      { role: 'assistant', text: 'Yes, it takes the centre.', toolCalls: [] },
    ]
    expect(followUpText(earlier, 'And d4?')).toBe(
      'Our conversation so far:\n\nMe: Was e4 good?\n\nYou: Yes, it takes the centre.\n\n---\n\nAnd d4?',
    )
  })

  it(`keeps the last ${FOLLOW_UP_EXCHANGES} exchanges`, () => {
    const earlier = Array.from({ length: FOLLOW_UP_EXCHANGES + 2 }, (_, i) => exchange(i)).flat()
    const text = followUpText(earlier, 'next')
    expect(text).not.toContain('question 1\n')
    expect(text).toContain('Me: question 2\n')
    expect(text).toContain(`You: answer ${FOLLOW_UP_EXCHANGES + 1}`)
  })
})
