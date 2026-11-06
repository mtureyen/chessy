import { describe, expect, it } from 'vitest'
import { parseWalkthrough, type WalkthroughFacts } from '../domain/walkthrough'
import { echoTool, scriptedClient } from '../testing'
import { InMemoryConversationStore } from '../adapters/inMemoryConversationStore'
import { LoopAgent } from './loopAgent'
import { writeWalkthrough } from './writeWalkthrough'

const facts: WalkthroughFacts = {
  side: 'white',
  accuracy: { white: 70 },
  opening: { name: 'Vienna Game' },
  moments: [
    {
      ply: 5,
      move: '3. Qxf7+',
      color: 'white',
      verdict: 'blunder',
      winBefore: 60,
      winAfter: 3,
      better: { move: 'Bc4', line: '3. Bc4' },
      played: '3... Kxf7',
      bestReply: '3... Kxf7',
    },
    { ply: 9, move: '5. Nf3', color: 'white', verdict: 'great', winBefore: 40, winAfter: 60 },
  ],
}

const good = {
  summary: 'You gave up the queen early.',
  opening: 'The Vienna went wrong again.',
  moments: [
    { ply: 5, what: 'This gave the queen away.', better: 'Developing keeps your pieces.' },
    { ply: 9, what: 'A fine find.' },
  ],
  focus: 'Check what defends a piece before you take.',
}

describe('parseWalkthrough', () => {
  it('reads the JSON, also inside a code fence', () => {
    expect(parseWalkthrough(JSON.stringify(good), facts)).toEqual(good)
    expect(parseWalkthrough(`\`\`\`json\n${JSON.stringify(good)}\n\`\`\``, facts)).toEqual(good)
  })

  it('drops what it made up: other moments, a better move or opening it was not given', () => {
    const reply = {
      ...good,
      moments: [
        { ply: 9, what: 'A fine find.', better: 'Invented.' },
        { ply: 5, what: 'This gave the queen away.', better: 'Developing keeps your pieces.' },
        { ply: 7, what: 'Not a moment.' },
      ],
    }
    expect(parseWalkthrough(JSON.stringify(reply), facts)).toEqual(good)
    const { opening: _, ...noOpening } = facts
    expect(parseWalkthrough(JSON.stringify(good), noOpening)).not.toHaveProperty('opening')
  })

  it('refuses what it cannot use', () => {
    expect(parseWalkthrough('Sorry, no.', facts)).toBeUndefined()
    expect(parseWalkthrough('{ "summary": ', facts)).toBeUndefined()
    expect(parseWalkthrough(JSON.stringify({ ...good, focus: '' }), facts)).toBeUndefined()
    const missing = { ...good, moments: [good.moments[0]] }
    expect(parseWalkthrough(JSON.stringify(missing), facts)).toBeUndefined()
  })
})

function agentSaying(...replies: string[]) {
  const { client, requests } = scriptedClient(replies.map((text) => ({ text })))
  const agent = new LoopAgent({
    id: 'a',
    label: 'A',
    client,
    tools: [echoTool],
    conversations: new InMemoryConversationStore(),
  })
  return { agent, requests }
}

describe('writeWalkthrough', () => {
  it('asks once, with no tools, from the facts alone', async () => {
    const { agent, requests } = agentSaying(JSON.stringify(good))
    expect(await writeWalkthrough(agent, facts)).toEqual(good)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.tools).toEqual([])
    expect(JSON.stringify(requests[0]!.messages)).toContain('3. Qxf7+')
  })

  it('asks again after an unusable reply, then gives up', async () => {
    const second = agentSaying('Here you go!', JSON.stringify(good))
    expect(await writeWalkthrough(second.agent, facts)).toEqual(good)
    const hopeless = agentSaying('No.', 'Still no.')
    await expect(writeWalkthrough(hopeless.agent, facts)).rejects.toThrow(/no usable walkthrough/)
  })
})
