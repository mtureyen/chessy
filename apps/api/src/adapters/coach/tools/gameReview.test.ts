import type { GameReview, ReviewInput } from '@pawnia/analysis'
import { createGame } from '@pawnia/chess'
import type { CoachContext, CoachTool } from '@pawnia/coach'
import { InMemoryReviewRepository } from '@pawnia/history'
import { sampleReview } from '@pawnia/history/testing'
import { buildProfile, InMemoryGameRepository } from '@pawnia/library'
import { sampleGame } from '@pawnia/library/testing'
import { describe, expect, it } from 'vitest'
import { gameReviewTool, type GameReviewAccess } from './gameReview'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const PGN =
  '[White "8sly"]\n[Black "rival"]\n[WhiteElo "790"]\n[Result "0-1"]\n\n1. e4 f6 2. d4 g5 3. Nc3 * '

/** A review of 1. e4 f6 2. d4 g5 3. Nc3 where White's third move missed mate (Qh5#). */
function reviewOf(input: ReviewInput): GameReview {
  const { review } = sampleReview({ startFen: input.startFen, moves: input.moves })
  const missed = review.moves[4]!
  missed.classification = 'miss'
  missed.winBefore = 100
  missed.winAfter = 70
  missed.best = { uci: 'd1h5', san: 'Qh5#', line: ['d1h5'] }
  const game = createGame(input.startFen)
  const fens = [game.root.fen, ...input.moves.map((uci) => game.play(uci)!.fen)]
  return {
    ...review,
    positions: fens.map((fen) => ({ fen, score: { type: 'cp', value: 0 }, whiteWin: 50 })),
  }
}

function setup() {
  const games = new InMemoryGameRepository()
  const reviews = new InMemoryReviewRepository(games)
  const inputs: ReviewInput[] = []
  const access: GameReviewAccess = {
    game: (id) => games.get(id),
    profile: async () =>
      buildProfile(
        { accounts: [{ source: 'chesscom', username: '8sly' }] },
        { id: 'p', now: '2026-11-05T00:00:00.000Z' },
      ),
    reviews: {
      reviews,
      review: async (input) => {
        inputs.push(input)
        return reviewOf(input)
      },
      now: () => new Date('2026-11-05T12:00:00.000Z'),
    },
  }
  return { tool: gameReviewTool(access), games, reviews, inputs }
}

async function call(tool: CoachTool, input: unknown, context: CoachContext = {}) {
  const parsed = tool.parse(input)
  if (!parsed.ok) throw new Error(parsed.error)
  return JSON.parse((await tool.run(parsed.value, context)).content)
}

describe('game_review', () => {
  it('reviews the game on the board once, with its ratings, and lists the key moments', async () => {
    const { tool, reviews, inputs } = setup()
    const result = await call(tool, {}, { pgn: PGN })
    expect(inputs).toEqual([
      {
        startFen: START,
        moves: ['e2e4', 'f7f6', 'd2d4', 'g7g5', 'b1c3'],
        ratings: { white: 790 },
      },
    ])
    expect(result.game).toMatchObject({
      white: '8sly (790)',
      black: 'rival',
      result: '0-1',
      userColor: 'white',
      reviewed: expect.stringMatching(/^just now/),
    })
    expect(result.keyMoments).toEqual([
      {
        ply: 5,
        move: '3. b1c3',
        color: 'white',
        class: 'miss',
        winningChances: '100% → 70%',
        better: { move: 'Qh5#', line: '3. Qh5#' },
        fenBefore: 'rnbqkbnr/ppppp2p/5p2/6p1/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3',
      },
    ])
    expect(await reviews.count()).toBe(1)

    // Asked again, it uses the stored review.
    const again = await call(tool, {}, { pgn: PGN })
    expect(again.game.reviewed).toBe('on 2026-11-05')
    expect(inputs).toHaveLength(1)
  })

  it('reviews a stored game by id and shows one move in detail', async () => {
    const { tool, games } = setup()
    const game = sampleGame({ pgn: PGN, white: { name: '8sly', rating: 800 } })
    await games.saveAll([game])
    const result = await call(tool, { gameId: game.id, ply: 1 })
    expect(result.game).toMatchObject({ white: '8sly (800)', date: '2026-10-20' })
    expect(result.move).toMatchObject({
      ply: 1,
      move: '1. e2e4',
      class: 'best',
      fenBefore: START,
      fenAfter: AFTER_E4,
      accuracy: 100,
    })
  })

  it('says what is missing when it cannot review', async () => {
    const { tool } = setup()
    await expect(call(tool, {})).rejects.toThrow(/no game on the board/)
    await expect(call(tool, { gameId: 'nope' })).rejects.toThrow(/search_games/)
    await expect(call(tool, { ply: 99 }, { pgn: PGN })).rejects.toThrow(/no move 99/)
    await expect(call(tool, {}, { pgn: '[White "a"]\n\n*' })).rejects.toThrow(/no moves/)
  })
})
