import type {
  GameReview,
  MoveClass,
  OpeningBook,
  ReviewedMove,
  ReviewInput,
} from '@pawnia/analysis'
import { createGame } from '@pawnia/chess'
import { InMemoryConversationStore, LoopAgent } from '@pawnia/coach'
import { scriptedClient } from '@pawnia/coach/testing'
import { lineText, type GameLine, type StoredReview } from '@pawnia/history'
import { sampleReview, sampleSummary } from '@pawnia/history/testing'
import { buildProfile } from '@pawnia/library'
import { describe, expect, it } from 'vitest'
import type { StoredTry } from '../db/tryStore'
import type { StoredWalkthrough } from '../db/walkthroughStore'
import { StoredWalkthroughs, type TryJudge, type WalkthroughLibrary } from './walkthroughs'
import { IllegalTryError, NoStoredReviewError } from './walkthroughService'

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

function setup(first: StoredReview | undefined = reviewed()) {
  const tryClass: { value: MoveClass } = { value: 'mistake' }
  const current = { stored: first }
  const kept = new Map<string, StoredWalkthrough>()
  const keptTries = new Map<string, StoredTry>()
  const key = (line: GameLine, side: string) => `${lineText(line)}|${side}`
  const tryKey = (line: GameLine, ply: number, tried: string) => `${lineText(line)}|${ply}|${tried}`
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
    findReview: async () => current.stored,
    findWalkthrough: async (line, side) => kept.get(key(line, side)),
    saveWalkthrough: async (line, side, value) => void kept.set(key(line, side), value),
    findTry: async (line, ply, tried) => keptTries.get(tryKey(line, ply, tried)),
    saveTry: async (line, ply, tried, value) => void keptTries.set(tryKey(line, ply, tried), value),
  }
  const book: OpeningBook = {
    isBook: () => true,
    opening: (fen) =>
      fen.startsWith('rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5')
        ? { eco: 'C25', name: 'Vienna Game' }
        : undefined,
  }
  const judged: ReviewInput[] = []
  const tries: TryJudge = {
    review: async (input) => {
      judged.push(input)
      const { review } = sampleReview({ startFen: input.startFen, moves: input.moves })
      review.moves[0]!.classification = tryClass.value
      review.moves[0]!.winBefore = 55
      review.moves[0]!.winAfter = 20
      return review
    },
    bestReply: async () => ['f6h5'],
  }
  const service = new StoredWalkthroughs(
    library,
    async () => book,
    tries,
    () => new Date('2026-11-06T12:00:00.000Z'),
  )
  return { service, kept, keptTries, judged, tryClass, current }
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
        findTry: async () => undefined,
        saveTry: async () => {},
      },
      async () => undefined,
      { review: async () => reviewed().review, bestReply: async () => [] },
    )
    await expect(missing.find(request)).rejects.toBeInstanceOf(NoStoredReviewError)
    await expect(missing.write(request, agent(reply).coach)).rejects.toBeInstanceOf(
      NoStoredReviewError,
    )
  })

  describe('a move tried at a moment', () => {
    const at = { startFen: START, moves: MOVES, ply: 5 }

    it('knows the move played and the better one without the engine', async () => {
      const { service, judged } = setup()
      expect(await service.judge({ ...at, tried: 'd1h5' }, undefined)).toMatchObject({
        verdict: 'played',
        san: 'Qh5',
      })
      expect(await service.judge({ ...at, tried: 'g1f3' }, undefined)).toMatchObject({
        verdict: 'right',
        san: 'Nf3',
      })
      expect(judged).toEqual([])
    })

    it('lets the review judge other moves; a move nearly as good is right', async () => {
      const { service, tryClass, judged } = setup()
      tryClass.value = 'excellent'
      expect(await service.judge({ ...at, tried: 'f1c4' }, undefined)).toMatchObject({
        verdict: 'right',
        san: 'Bc4',
      })
      expect(judged[0]).toMatchObject({ moves: ['f1c4'], ratings: { white: 790 } })
      tryClass.value = 'good'
      expect((await service.judge({ ...at, tried: 'g1e2' }, undefined)).verdict).toBe('close')
    })

    it('has the coach comment on a wrong try, with no better move in what it gets', async () => {
      const { service } = setup()
      const { coach, requests } = agent('That leaves your queen with nowhere to go.')
      const answer = await service.judge({ ...at, tried: 'd1g4' }, coach)
      expect(answer).toMatchObject({
        verdict: 'wrong',
        san: 'Qg4',
        comment: 'That leaves your queen with nowhere to go.',
      })
      expect(requests[0]!.tools).toEqual([])
      const facts = JSON.stringify(requests[0]!.messages)
      expect(facts).toContain('Qg4')
      expect(facts).not.toContain('Nf3')
      expect(facts).not.toContain('g1f3')
    })

    it('gives the verdict alone without a coach, or when the coach fails', async () => {
      const { service } = setup()
      expect(await service.judge({ ...at, tried: 'd1g4' }, undefined)).toEqual({
        verdict: 'wrong',
        san: 'Qg4',
        fen: expect.any(String),
      })
      const failing = agent()
      const answer = await service.judge({ ...at, tried: 'd1g4' }, failing.coach)
      expect(answer).not.toHaveProperty('comment')
    })

    it('answers the same wrong try again from what it kept, without the engine or the coach', async () => {
      const { service, judged } = setup()
      const { coach, requests } = agent('That leaves your queen with nowhere to go.', 'Again?')
      const first = await service.judge({ ...at, tried: 'd1g4' }, coach)
      expect(await service.judge({ ...at, tried: 'd1g4' }, coach)).toEqual(first)
      // Another agent, or none, gets the kept answer too.
      expect(await service.judge({ ...at, tried: 'd1g4' }, undefined)).toEqual(first)
      expect(requests).toHaveLength(1)
      expect(judged).toHaveLength(1)

      const other = await service.judge({ ...at, tried: 'd1f3' }, coach)
      expect(other).toMatchObject({ san: 'Qf3', comment: 'Again?' })
      expect(requests).toHaveLength(2)
    })

    it('judges again after a newer review', async () => {
      const { service, judged, current } = setup()
      const { coach, requests } = agent('Not that.', 'Still not that.')
      await service.judge({ ...at, tried: 'd1g4' }, coach)
      current.stored = reviewed('2026-11-06T10:00:00.000Z')
      const again = await service.judge({ ...at, tried: 'd1g4' }, coach)
      expect(again.comment).toBe('Still not that.')
      expect(requests).toHaveLength(2)
      expect(judged).toHaveLength(2)
    })

    it('keeps a close try, but not a wrong one the coach said nothing on', async () => {
      const { service, keptTries, tryClass } = setup()
      await service.judge({ ...at, tried: 'd1g4' }, undefined)
      await service.judge({ ...at, tried: 'd1g4' }, agent().coach)
      expect(keptTries.size).toBe(0)
      const { coach, requests } = agent('Now I have something to say.')
      expect((await service.judge({ ...at, tried: 'd1g4' }, coach)).comment).toBe(
        'Now I have something to say.',
      )
      expect(requests).toHaveLength(1)

      tryClass.value = 'good'
      await service.judge({ ...at, tried: 'f1c4' }, undefined)
      expect([...keptTries.values()].map((kept) => kept.judged.verdict)).toEqual(['wrong', 'close'])
    })

    it('refuses an illegal move and a moment that is not there', async () => {
      const { service } = setup()
      await expect(service.judge({ ...at, tried: 'a1a8' }, undefined)).rejects.toBeInstanceOf(
        IllegalTryError,
      )
      await expect(
        service.judge({ ...at, ply: 99, tried: 'g1f3' }, undefined),
      ).rejects.toBeInstanceOf(NoStoredReviewError)
    })
  })
})
