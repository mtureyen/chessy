import { describe, expect, it } from 'vitest'
import { InMemoryConversationStore } from '../adapters/inMemoryConversationStore'
import { LINE_NOTES_PROMPT, parseLineNotes, type LineNotesFacts } from '../domain/lineNotes'
import { scriptedClient } from '../testing'
import { LoopAgent } from './loopAgent'
import { writeLineNotes } from './writeLineNotes'

const facts: LineNotesFacts = {
  opening: 'Caro-Kann Defense',
  side: 'black',
  variation: 'Caro-Kann Defense: Hillbilly Attack',
  line: [
    { ply: 1, move: '1.e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' },
    {
      ply: 2,
      move: '1...c6',
      fen: 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      share: 7,
    },
    {
      ply: 3,
      move: '2.Bc4',
      fen: 'rnbqkbnr/pp1ppppp/2p5/8/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2',
      share: 7,
    },
  ],
  score: 53,
}

const good = {
  moves: [
    { ply: 1, note: 'White takes the centre.' },
    { ply: 2, note: 'You prepare ...d5.' },
    {
      ply: 3,
      note: '2.Bc4 A rare try that runs into ...d5 with tempo.',
      draw: { arrows: [{ from: 'c4', to: 'f7', color: 'red' }] },
    },
  ],
}

describe('parseLineNotes', () => {
  it('reads a note for every ply, without its move in front, with what can be drawn', () => {
    expect(parseLineNotes(`Sure:\n${JSON.stringify(good)}`, facts)).toEqual([
      { ply: 1, note: 'White takes the centre.' },
      { ply: 2, note: 'You prepare ...d5.' },
      {
        ply: 3,
        note: 'A rare try that runs into ...d5 with tempo.',
        draw: { arrows: [{ from: 'c4', to: 'f7', color: 'red' }], squares: [] },
      },
    ])
  })

  it('wants every ply', () => {
    expect(parseLineNotes(JSON.stringify({ moves: good.moves.slice(0, 2) }), facts)).toBeUndefined()
    expect(parseLineNotes('no json', facts)).toBeUndefined()
  })
})

describe('writeLineNotes', () => {
  const agent = (replies: string[]) => {
    const { client, requests } = scriptedClient(replies.map((text) => ({ text })))
    return {
      requests,
      agent: new LoopAgent({
        id: 'scripted',
        label: 'Scripted coach',
        client,
        tools: [],
        conversations: new InMemoryConversationStore(),
      }),
    }
  }

  it('hands the facts to the coach and asks again once when the reply is unusable', async () => {
    const { agent: coach, requests } = agent(['not json', JSON.stringify(good)])
    const notes = await writeLineNotes(coach, facts)
    expect(notes).toHaveLength(3)
    expect(requests).toHaveLength(2)
    expect(JSON.stringify(requests[0])).toContain('Hillbilly Attack')
    expect(LINE_NOTES_PROMPT).toContain('"draw" is optional')
  })

  it('gives up after two unusable replies', async () => {
    const { agent: coach } = agent(['no', 'still no'])
    await expect(writeLineNotes(coach, facts)).rejects.toThrow('no usable notes')
  })
})
