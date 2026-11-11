import { describe, expect, it } from 'vitest'
import { parseOpeningGuide, type OpeningGuideFacts } from '../domain/openingGuide'
import { scriptedClient } from '../testing'
import { InMemoryConversationStore } from '../adapters/inMemoryConversationStore'
import { LoopAgent } from './loopAgent'
import { writeOpeningGuide } from './writeOpeningGuide'

const facts: OpeningGuideFacts = {
  name: 'Caro-Kann Defense',
  side: 'black',
  main: '1.e4 c6',
  line: [
    { ply: 1, move: '1.e4' },
    { ply: 2, move: '1...c6' },
  ],
  variations: [
    { name: 'Advance Variation', moves: '1.e4 c6 2.d4 d5 3.e5', games: 23000, score: 50 },
  ],
  replies: [{ move: '2.d4', share: 43, score: 49 }],
  scores: { '1200-1599': 51 },
  traps: [],
}

const good = {
  story: 'Named after Horatio Caro and Marcus Kann.',
  ideas: 'Support d5 with c6, then free the light-squared bishop.',
  opponents: 'Most play 2.d4: answer 2...d5.',
  moves: [
    { ply: 1, note: 'White takes the centre.' },
    { ply: 2, note: 'Black prepares ...d5.' },
  ],
}

describe('parseOpeningGuide', () => {
  it('reads the JSON, also with text around it', () => {
    expect(
      parseOpeningGuide(`Here you go:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\``, facts),
    ).toEqual(good)
  })

  it('drops the move when a note starts with it', () => {
    const repeated = {
      ...good,
      moves: [
        { ply: 1, note: '1.e4 White takes the centre.' },
        { ply: 2, note: 'c6: Black prepares ...d5.' },
      ],
    }
    expect(parseOpeningGuide(JSON.stringify(repeated), facts)?.moves).toEqual(good.moves)
  })

  it('wants a note for every ply of the line, in its order', () => {
    expect(
      parseOpeningGuide(JSON.stringify({ ...good, moves: [good.moves[0]] }), facts),
    ).toBeUndefined()
    const reversed = { ...good, moves: [...good.moves].reverse() }
    expect(parseOpeningGuide(JSON.stringify(reversed), facts)?.moves.map((m) => m.ply)).toEqual([
      1, 2,
    ])
    expect(parseOpeningGuide('no json here', facts)).toBeUndefined()
    expect(parseOpeningGuide(JSON.stringify({ ...good, story: '' }), facts)).toBeUndefined()
  })
})

describe('writeOpeningGuide', () => {
  const agent = (replies: string[]) =>
    new LoopAgent({
      id: 'scripted',
      label: 'Scripted coach',
      client: scriptedClient(replies.map((text) => ({ text }))).client,
      tools: [],
      conversations: new InMemoryConversationStore(),
    })

  it('asks again once when the first reply is unusable', async () => {
    expect(await writeOpeningGuide(agent(['not json', JSON.stringify(good)]), facts)).toEqual(good)
  })

  it('gives up after two unusable replies', async () => {
    await expect(writeOpeningGuide(agent(['nope', 'still nope']), facts)).rejects.toThrow(
      'no usable guide',
    )
  })
})
