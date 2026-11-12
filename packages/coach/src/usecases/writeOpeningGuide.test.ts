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
    { ply: 1, move: '1.e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' },
    {
      ply: 2,
      move: '1...c6',
      fen: 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    },
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

describe('the drawings of a guide', () => {
  const drawn = (draw: unknown) =>
    parseOpeningGuide(
      JSON.stringify({ ...good, moves: [good.moves[0], { ...good.moves[1], draw }] }),
      facts,
    )?.moves[1]?.draw

  it('keeps arrows that start on a piece, and marked squares', () => {
    const draw = {
      arrows: [{ from: 'c6', to: 'd5', color: 'green' }],
      squares: [{ square: 'd5', color: 'yellow' }],
    }
    expect(drawn(draw)).toEqual(draw)
    expect(drawn({ squares: [{ square: 'e4', color: 'red' }] })).toEqual({
      arrows: [],
      squares: [{ square: 'e4', color: 'red' }],
    })
  })

  it('leaves out what cannot be drawn, and the guide stays good', () => {
    // From an empty square, off the board, an unknown colour, to itself.
    const bad = [
      { from: 'c5', to: 'd4', color: 'green' },
      { from: 'c6', to: 'd9', color: 'green' },
      { from: 'c6', to: 'd5', color: 'pink' },
      { from: 'c6', to: 'c6', color: 'green' },
    ]
    expect(drawn({ arrows: bad })).toBeUndefined()
    expect(drawn('an arrow from c6 to d5')).toBeUndefined()
    expect(drawn({ arrows: [...bad, { from: 'd7', to: 'd5', color: 'green' }] })).toEqual({
      arrows: [{ from: 'd7', to: 'd5', color: 'green' }],
      squares: [],
    })
    const guide = parseOpeningGuide(
      JSON.stringify({ ...good, moves: [{ ...good.moves[0], draw: 7 }, good.moves[1]] }),
      facts,
    )
    expect(guide).toEqual(good)
  })

  it('draws at most three arrows and three squares', () => {
    const arrows = ['a7', 'b7', 'd7', 'e7'].map((from) => ({
      from,
      to: `${from[0]}5`,
      color: 'green',
    }))
    const squares = ['a5', 'b5', 'd5', 'e5'].map((square) => ({ square, color: 'blue' }))
    const kept = drawn({ arrows, squares })
    expect(kept?.arrows).toHaveLength(3)
    expect(kept?.squares).toHaveLength(3)
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
