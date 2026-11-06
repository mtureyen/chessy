import type { GameReview, OpeningBook, ReviewedMove } from '@chessy/analysis'
import { createGame } from '@chessy/chess'
import { InMemoryConversationStore, LoopAgent } from '@chessy/coach'
import { scriptedClient } from '@chessy/coach/testing'
import { lineText, type GameLine, type StoredReview } from '@chessy/history'
import { sampleReview, sampleSummary } from '@chessy/history/testing'
import { buildProfile } from '@chessy/library'
import { describe, expect, it } from 'vitest'
import type { StoredWalkthrough } from '../db/walkthroughStore'
import { StoredWalkthroughs, type WalkthroughLibrary } from './walkthroughs'
import { NoStoredReviewError } from './walkthroughService'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MOVES = ['e2e4', 'e7e5', 'b1c3', 'g8f6', 'd1h5', 'f6h5']
const SAN = ['e4', 'e5', 'Nc3', 'Nf6', 'Qh5', 'Nxh5']
const request = { startFen: START, moves: MOVES, side: 'white' as const }

/** A game the book knows up to 2. Nc3 (the Vienna Game), then 3. Qh5 gives the queen away. */
function reviewed(reviewedAt = '2026-11-05T10:00:00.000Z'): StoredReview {
  const game = createGame()
  const fens = [game.root.fen, ...MOVES.map((uci) => game.play(uci)!.fen)]
  const { line, review } = sampleReview({ startFen: START, moves: MOVES })
  review.moves.forEach((move, i) => {
    move.san = SAN[i]!
    if (i < 3) move.classification = 'book'
    move.facts.rating = 790
  })
  const blunder: ReviewedMove = review.moves[4]!
  blunder.classification = 'blunder'
  blunder.winBefore = 55
  blunder.winAfter = 2
  blunder.best = { uci: 'g1f3', san: 'Nf3', line: ['g1f3'] }
  const withPositions: GameReview = {
    ...review,
    positions: fens.map((fen) => ({ fen, score: { type: 'cp', value: 0 }, whiteWin: 50 })),
  }
  return { line, review: withPositions, reviewedAt }
}

function setup(stored: StoredReview | undefined = reviewed()) {
  const kept = new Map<string, StoredWalkthrough>()
  const key = (line: GameLine, side: string) => `${lineText(line)}|${side}`
  const library: WalkthroughLibrary = {
    summaries: async () => [
      sampleSummary({
        id: 'a',
        opening: { name: 'Vienna Game Falkbeer Variation' },
        result: '0-1',
      }),
      sampleSummary({ id: 'b', opening: { name: 'Vienna Game' }, result: '1-0' }),
      sampleSummary({ id: 'c', opening: { name: 'Italian Game' } }),
    ],
    profile: async () =>
      buildProfile(
        { accounts: [{ source: 'chesscom', username: '8sly' }] },
        { id: 'p', now: '2026-11-05T00:00:00.000Z' },
      ),
    findReview: async () => stored,
    findWalkthrough: async (line, side) => kept.get(key(line, side)),
    saveWalkthrough: async (line, side, value) => void kept.set(key(line, side), value),
  }
  const book: OpeningBook = {
    isBook: () => true,
    opening: (fen) =>
      fen.startsWith('rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5')
        ? { eco: 'C25', name: 'Vienna Game' }
        : undefined,
  }
  const service = new StoredWalkthroughs(
    library,
    async () => book,
    () => new Date('2026-11-06T12:00:00.000Z'),
  )
  return { service, kept }
}

const reply = JSON.stringify({
  summary: 'You gave your queen away on move 3.',
  opening: 'The Vienna again.',
  moments: [{ ply: 5, what: 'The knight on f6 covers h5.', better: 'Nf3 develops.' }],
  focus: 'Check what guards a square before you go there.',
})

function agent(...replies: string[]) {
  const { client, requests } = scriptedClient(replies.map((text) => ({ text })))
  const coach = new LoopAgent({
    id: 'claude-api',
    label: 'Claude (test)',
    client,
    tools: [],
    conversations: new InMemoryConversationStore(),
  })
  return { coach, requests }
}

describe('StoredWalkthroughs', () => {
  it("writes from the review's facts, with the opening and the user's record in it", async () => {
    const { service } = setup()
    const { coach, requests } = agent(reply)
    const walkthrough = await service.write(request, coach)

    expect(walkthrough).toEqual({
      summary: 'You gave your queen away on move 3.',
      opening: {
        name: 'Vienna Game',
        ply: 3,
        text: 'The Vienna again.',
        record: { of: 'Vienna Game', games: 2, wins: 1, draws: 0, losses: 1 },
      },
      moments: [{ ply: 5, what: 'The knight on f6 covers h5.', better: 'Nf3 develops.' }],
      focus: 'Check what guards a square before you go there.',
      agent: 'Claude (test)',
      writtenAt: '2026-11-06T12:00:00.000Z',
    })
    const facts = JSON.stringify(requests[0]!.messages)
    expect(facts).toContain('3. Qh5')
    expect(facts).toContain('790')
    expect(facts).toContain('played')
    expect(requests[0]!.tools).toEqual([])
  })

  it('keeps a walkthrough per side until a newer review replaces the one it came from', async () => {
    const first = setup()
    await first.service.write(request, agent(reply).coach)
    expect(await first.service.find(request)).toMatchObject({ agent: 'Claude (test)' })
    expect(await first.service.find({ ...request, side: 'black' })).toBeUndefined()

    const newer = setup(reviewed('2026-11-06T10:00:00.000Z'))
    for (const [key, stored] of first.kept) newer.kept.set(key, stored)
    expect(await newer.service.find(request)).toBeUndefined()
  })

  it('needs a stored review', async () => {
    const missing = new StoredWalkthroughs(
      {
        summaries: async () => [],
        profile: async () => undefined,
        findReview: async () => undefined,
        findWalkthrough: async () => undefined,
        saveWalkthrough: async () => {},
      },
      async () => undefined,
    )
    await expect(missing.find(request)).rejects.toBeInstanceOf(NoStoredReviewError)
    await expect(missing.write(request, agent(reply).coach)).rejects.toBeInstanceOf(
      NoStoredReviewError,
    )
  })
})
