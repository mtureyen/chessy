import type { ReviewedMove } from '@pawnia/analysis'
import { createGame } from '@pawnia/chess'
import { buildProfile } from '@pawnia/library'
import { describe, expect, it } from 'vitest'
import { sampleReview, sampleSummary } from '../testing'
import { playerGames } from './playerGames'
import { afterAttempt, gamePuzzles, puzzleState } from './training'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const UCI = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5f7', 'e8f7']
const SAN = ['e4', 'e5', 'Qh5', 'Nc6', 'Qxf7+', 'Kxf7']
const profile = buildProfile(
  { accounts: [{ source: 'chesscom', username: '8sly' }] },
  { id: 'p', now: '2026-11-05T00:00:00.000Z' },
)
const [game] = playerGames([sampleSummary({ id: 'g' })], profile)

function reviewWith(change: (move: ReviewedMove) => void) {
  const board = createGame()
  const fens = [board.root.fen, ...UCI.map((uci) => board.play(uci)!.fen)]
  const { line, review } = sampleReview({ startFen: START, moves: UCI })
  review.moves.forEach((move, i) => (move.san = SAN[i]!))
  const blunder = review.moves[4]!
  blunder.classification = 'blunder'
  blunder.best = { uci: 'f1c4', san: 'Bc4', line: ['f1c4', 'g8f6'] }
  blunder.facts.winBefore = 60
  blunder.facts.secondBestWin = 40
  change(blunder)
  return {
    line,
    review: {
      ...review,
      positions: fens.map((fen) => ({
        fen,
        score: { type: 'cp' as const, value: 0 },
        whiteWin: 50,
      })),
    },
  }
}

describe('gamePuzzles', () => {
  it("makes a puzzle of the user's mistake with one clearly better move", () => {
    const { line, review } = reviewWith(() => {})
    expect(gamePuzzles(game!, line, review)).toEqual([
      {
        line,
        ply: 5,
        fen: review.positions[4]!.fen,
        color: 'white',
        played: '3. Qxf7+',
        verdict: 'blunder',
        best: { move: 'Bc4', uci: 'f1c4', line: '3. Bc4 Nf6' },
        game: {
          id: 'g',
          opponent: 'rival',
          date: '2026-10-01',
          opening: 'Italian Game Two Knights Defense',
        },
      },
    ])
  })

  it('leaves out positions without one clear answer, and moves of the opponent', () => {
    const count = (change: (move: ReviewedMove) => void) => {
      const { line, review } = reviewWith(change)
      return gamePuzzles(game!, line, review).length
    }
    expect(count((m) => (m.facts.secondBestWin = 55))).toBe(0)
    expect(count((m) => delete m.facts.secondBestWin)).toBe(0)
    expect(count((m) => (m.classification = 'inaccuracy'))).toBe(0)
    expect(count((m) => (m.color = 'black'))).toBe(0)
    expect(count((m) => (m.best = { uci: m.uci, san: m.san, line: [] }))).toBe(0)
  })
})

describe('the repeat schedule', () => {
  const now = new Date('2026-11-06T12:00:00.000Z')
  const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString()

  it('is done with a puzzle solved at the first try', () => {
    expect(afterAttempt(undefined, true, now)).toEqual({ misses: 0 })
    expect(afterAttempt({ misses: 2, dueAt: inDays(0) }, true, now)).toEqual({ misses: 2 })
  })

  it('brings a missed puzzle back after 1, 3 and then every 7 days', () => {
    const first = afterAttempt(undefined, false, now)
    expect(first).toEqual({ misses: 1, dueAt: inDays(1) })
    const second = afterAttempt(first, false, now)
    expect(second).toEqual({ misses: 2, dueAt: inDays(3) })
    const third = afterAttempt(second, false, now)
    expect(third).toEqual({ misses: 3, dueAt: inDays(7) })
    expect(afterAttempt(third, false, now)).toEqual({ misses: 4, dueAt: inDays(7) })
  })

  it('tells what is due, waiting and solved', () => {
    expect(puzzleState(undefined, now)).toBe('due')
    expect(puzzleState({ misses: 1, dueAt: inDays(-1) }, now)).toBe('due')
    expect(puzzleState({ misses: 1, dueAt: inDays(1) }, now)).toBe('waiting')
    expect(puzzleState({ misses: 0 }, now)).toBe('solved')
  })
})
