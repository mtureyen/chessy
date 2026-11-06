import { createGame } from '@chessy/chess'
import { lineText, type GameLine, type PuzzleProgress, type StoredReview } from '@chessy/history'
import { sampleReview, sampleSummary } from '@chessy/history/testing'
import { buildProfile } from '@chessy/library'
import { sampleGame } from '@chessy/library/testing'
import { describe, expect, it } from 'vitest'
import { StoredTraining, type TrainingLibrary } from './storedTraining'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const UCI = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5f7', 'e8f7']
const PGN = '1. e4 e5 2. Qh5 Nc6 3. Qxf7+ Kxf7 *'
const line = { startFen: START, moves: UCI }
const NOW = '2026-11-06T12:00:00.000Z'

function stored(): StoredReview {
  const board = createGame()
  const fens = [board.root.fen, ...UCI.map((uci) => board.play(uci)!.fen)]
  const review = sampleReview(line)
  const blunder = review.review.moves[4]!
  blunder.classification = 'blunder'
  blunder.best = { uci: 'f1c4', san: 'Bc4', line: ['f1c4'] }
  blunder.facts.winBefore = 60
  blunder.facts.secondBestWin = 30
  review.review.positions = fens.map((fen) => ({
    fen,
    score: { type: 'cp', value: 0 },
    whiteWin: 50,
  }))
  return review
}

function setup() {
  const progress = new Map<string, PuzzleProgress>()
  const key = (at: GameLine, ply: number) => `${lineText(at)}:${ply}`
  const library: TrainingLibrary = {
    summaries: async () => [
      sampleSummary({ id: 'reviewed', reviewed: true }),
      sampleSummary({ id: 'not-reviewed' }),
    ],
    profile: async () =>
      buildProfile(
        { accounts: [{ source: 'chesscom', username: '8sly' }] },
        { id: 'p', now: '2026-11-05T00:00:00.000Z' },
      ),
    game: async (id) => sampleGame({ id, pgn: PGN }),
    findReview: async () => stored(),
    trainingProgress: async () => progress,
    saveTrainingProgress: async (at, ply, value) => void progress.set(key(at, ply), value),
  }
  let now = new Date(NOW)
  const training = new StoredTraining(library, key, () => now)
  return { training, later: (days: number) => (now = new Date(now.getTime() + days * 86_400_000)) }
}

const result = { ...line, ply: 5 }

describe('StoredTraining', () => {
  it('offers the mistakes of the reviewed games as due', async () => {
    const { training } = setup()
    const { due, waiting, solved } = await training.training()
    expect(due.map((p) => [p.game.id, p.ply, p.best.move])).toEqual([['reviewed', 5, 'Bc4']])
    expect({ waiting, solved }).toEqual({ waiting: 0, solved: 0 })
  })

  it('is done with a puzzle solved at the first try', async () => {
    const { training } = setup()
    await training.record({ ...result, solvedFirstTry: true })
    expect(await training.training()).toMatchObject({ due: [], waiting: 0, solved: 1 })
  })

  it('brings a missed puzzle back the next day', async () => {
    const { training, later } = setup()
    await training.record({ ...result, solvedFirstTry: false })
    expect(await training.training()).toMatchObject({ due: [], waiting: 1, solved: 0 })
    later(1)
    const { due, waiting } = await training.training()
    expect([due.length, waiting]).toEqual([1, 0])
  })
})
