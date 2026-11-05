import { describe, expect, it } from 'vitest'
import { ServerSentEvents } from './remoteCoach'

const bytes = (text: string) => new TextEncoder().encode(text)

describe('ServerSentEvents', () => {
  it('reads events split anywhere across chunks, skipping comments and unknown events', () => {
    const events = new ServerSentEvents()
    const stream =
      'event: text\ndata: {"type":"text","delta":"Hel"}\n\n' +
      ': keep-alive\n\n' +
      'event: text\r\ndata: {"type":"text","delta":"lo"}\r\n\r\n' +
      'data: {"type":"surprise"}\n\n' +
      'data: not json\n\n' +
      'event: done\ndata: {"type":"done","usage":{"inputTokens":3,"outputTokens":2}}\n\n'
    const seen = [stream.slice(0, 20), stream.slice(20, 75), stream.slice(75)].flatMap((part) =>
      events.push(bytes(part)),
    )
    expect(seen).toEqual([
      { type: 'text', delta: 'Hel' },
      { type: 'text', delta: 'lo' },
      { type: 'done', usage: { inputTokens: 3, outputTokens: 2 } },
    ])
  })
})
