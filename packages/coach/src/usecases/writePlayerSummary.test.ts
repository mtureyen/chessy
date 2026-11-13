import { describe, expect, it } from 'vitest'
import {
  OPPONENT_SUMMARY_PROMPT,
  OWN_SUMMARY_PROMPT,
  parsePlayerSummary,
  type PlayerSummaryFacts,
} from '../domain/playerSummary'
import { InMemoryConversationStore } from '../adapters/inMemoryConversationStore'
import { scriptedClient } from '../testing'
import { LoopAgent } from './loopAgent'
import { writePlayerSummary } from './writePlayerSummary'

const tally = (wins: number, draws: number, losses: number) => {
  const games = wins + draws + losses
  return { games, wins, draws, losses, score: Math.round(((wins + draws / 2) / games) * 100) }
}

const common = {
  name: 'Sly',
  window: { games: 30, speed: 'rapid' },
  record: tally(14, 2, 14),
  ratings: [{ series: 'chess.com rapid', start: 790, end: 812, games: 30 }],
  openings: { white: [{ name: 'Italian Game', ...tally(6, 0, 3) }], black: [] },
  firstMoves: {
    asWhite: [{ move: '1.e4', share: 100, ...tally(8, 1, 6) }],
    asBlack: [{ against: '1.e4', reply: '1...e5', games: 9, of: 11, score: 44 }],
  },
  endings: {
    wins: [{ how: 'resignation', games: 9 }],
    losses: [{ how: 'checkmate', games: 8 }],
    draws: [{ how: 'agreement', games: 2 }],
    averageMoves: 34,
  },
  opponents: [{ group: 'similar (within 100)', ...tally(10, 2, 9) }],
  timeOfDay: { timeZone: 'Europe/Berlin', parts: [{ part: 'evening (18-24)', ...tally(8, 1, 9) }] },
}

const own: PlayerSummaryFacts = {
  ...common,
  kind: 'own',
  moveQuality: {
    reviewedGames: 12,
    averageAccuracy: 71,
    perGame: { blunders: 2.1, mistakes: 1.4, misses: 0.5, inaccuracies: 3 },
    phases: {
      opening: { moves: 120, blunders: 0.2, mistakes: 0.3, misses: 0, inaccuracies: 1 },
      middlegame: { moves: 200, blunders: 1.5, mistakes: 0.8, misses: 0.4, inaccuracies: 1.5 },
      endgame: { moves: 80, blunders: 0.4, mistakes: 0.3, misses: 0.1, inaccuracies: 0.5 },
    },
  },
}

const opponent: PlayerSummaryFacts = {
  ...common,
  name: 'knightowl88',
  kind: 'opponent',
  platform: 'chess.com',
}

const good = {
  summary: 'You play 1.e4 in every White game and score 60% in the Italian Game.',
  focus: 'Blunders in the middlegame: 1.5 per game. Train on puzzles from your own mistakes.',
}

const agentWith = (replies: string[]) => {
  const { client, requests } = scriptedClient(replies.map((text) => ({ text })))
  const agent = new LoopAgent({
    id: 'scripted',
    label: 'Scripted coach',
    client,
    tools: [],
    conversations: new InMemoryConversationStore(),
  })
  return { agent, requests }
}

describe('parsePlayerSummary', () => {
  it('reads the JSON, also with text around it', () => {
    expect(parsePlayerSummary(`Here:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\``)).toEqual(good)
  })

  it('wants both parts, not empty', () => {
    expect(parsePlayerSummary('no json here')).toBeUndefined()
    expect(parsePlayerSummary(JSON.stringify({ summary: good.summary }))).toBeUndefined()
    expect(parsePlayerSummary(JSON.stringify({ ...good, focus: '  ' }))).toBeUndefined()
  })
})

describe('the summary prompts', () => {
  it('forbid claims about how a looked-up player moves', () => {
    for (const word of ['tactics', 'blunders', 'accuracy', 'calculation'])
      expect(OPPONENT_SUMMARY_PROMPT).toContain(word)
    expect(OPPONENT_SUMMARY_PROMPT).toMatch(/Never claim anything about the opponent's tactics/)
  })

  it('ask for one focus on the user’s own games, grounded in the facts', () => {
    expect(OWN_SUMMARY_PROMPT).toContain('exactly one focus')
    expect(OWN_SUMMARY_PROMPT).toContain('Never invent games')
    expect(OPPONENT_SUMMARY_PROMPT).toContain('Never invent games')
  })
})

describe('writePlayerSummary', () => {
  it('writes from the facts, with the prompt of their kind and no tools', async () => {
    const { agent, requests } = agentWith([JSON.stringify(good)])
    expect(await writePlayerSummary(agent, own)).toEqual(good)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.system).toBe(OWN_SUMMARY_PROMPT)
    expect(requests[0]?.tools).toEqual([])
    expect(JSON.stringify(requests[0]?.messages)).toContain('Italian Game')

    const scouted = agentWith([JSON.stringify(good)])
    await writePlayerSummary(scouted.agent, opponent)
    expect(scouted.requests[0]?.system).toBe(OPPONENT_SUMMARY_PROMPT)
  })

  it('asks once more after an unusable answer, then gives up', async () => {
    const retried = agentWith(['Sorry, here it is: {"summary": "cut', JSON.stringify(good)])
    expect(await writePlayerSummary(retried.agent, own)).toEqual(good)
    expect(retried.requests).toHaveLength(2)

    const failed = agentWith(['no json', 'still none', JSON.stringify(good)])
    await expect(writePlayerSummary(failed.agent, own)).rejects.toThrow('no usable summary')
    expect(failed.requests).toHaveLength(2)
  })
})
