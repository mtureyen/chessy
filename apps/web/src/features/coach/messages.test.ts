import type { CoachEventBody } from '@pawnia/contracts'
import { describe, expect, it } from 'vitest'
import { applyEvent, placed, type CoachMessage } from './messages'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const empty: CoachMessage = {
  id: 'r',
  role: 'coach',
  text: '',
  tools: [],
  drawings: [],
  status: 'answering',
}

const replay = (events: CoachEventBody[]) =>
  events.reduce((reply, event) => applyEvent(reply, event, undefined), empty)

describe('applyEvent', () => {
  it('builds the answer, starting a new paragraph after a tool call', () => {
    const reply = replay([
      { type: 'text', delta: 'Let me check' },
      { type: 'text', delta: ' the engine.' },
      { type: 'tool', name: 'evaluate_position', input: {} },
      { type: 'tool', name: 'evaluate_position', input: {} },
      { type: 'tool_result', name: 'evaluate_position', ok: true },
      { type: 'tool_result', name: 'evaluate_position', ok: false },
      { type: 'text', delta: 'White is better.' },
      { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } },
    ])
    expect(reply.text).toBe('Let me check the engine.\n\nWhite is better.')
    expect(reply.tools).toEqual([
      { name: 'evaluate_position', ok: false },
      { name: 'evaluate_position', ok: true },
    ])
    expect(reply.status).toBe('done')
    expect(reply.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
  })

  it('ends with the error the coach reported', () => {
    expect(replay([{ type: 'error', message: 'Credit balance too low' }])).toMatchObject({
      status: 'failed',
      error: 'Credit balance too low',
    })
  })
})

describe('placed', () => {
  it('puts a drawing without a position on the one the question was asked in', () => {
    const drawing = { arrows: [], squares: [{ square: 'e4', color: 'red' as const }] }
    expect(placed(drawing, { fen: START })).toEqual({ ...drawing, fen: START })
    expect(placed({ ...drawing, fen: 'x' }, { fen: START })?.fen).toBe('x')
    expect(placed(drawing, {})).toBeUndefined()
  })
})
