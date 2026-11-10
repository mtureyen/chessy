import type { TrainingBody, TrainingResultBody } from '@pawnia/contracts'
import {
  afterAttempt,
  gameLine,
  gamePuzzles,
  playerGames,
  puzzleState,
  type GameHistory,
  type GameLine,
  type Puzzle,
  type PuzzleProgress,
  type StoredReview,
} from '@pawnia/history'
import type { LibraryGame, Profile } from '@pawnia/library'
import type { StoredWalkthrough } from '../db/walkthroughStore'
import type { TrainingService } from './trainingService'

/** The newest reviewed games puzzles come from: training is about how the user plays now. */
const MAX_GAMES = 100
/** The most puzzles handed out at once. */
const MAX_DUE = 50

export interface TrainingLibrary extends Pick<GameHistory, 'summaries'> {
  profile(): Promise<Profile | undefined>
  game(id: string): Promise<LibraryGame | undefined>
  findReview(line: GameLine): Promise<StoredReview | undefined>
  findWalkthrough(line: GameLine, side: string): Promise<StoredWalkthrough | undefined>
  trainingProgress(): Promise<Map<string, PuzzleProgress>>
  saveTrainingProgress(line: GameLine, ply: number, progress: PuzzleProgress): Promise<void>
}

/** Puzzles from the mistakes in the user's reviewed games, and how far they are with them. */
export class StoredTraining implements TrainingService {
  private readonly library: TrainingLibrary
  private readonly key: (line: GameLine, ply: number) => string
  private readonly now: () => Date

  constructor(
    library: TrainingLibrary,
    key: (line: GameLine, ply: number) => string,
    now: () => Date = () => new Date(),
  ) {
    this.library = library
    this.key = key
    this.now = now
  }

  async training(): Promise<TrainingBody> {
    const [puzzles, progress] = await Promise.all([this.puzzles(), this.library.trainingProgress()])
    const now = this.now()
    const stateOf = (puzzle: Puzzle) =>
      puzzleState(progress.get(this.key(puzzle.line, puzzle.ply)), now)
    const count = (state: string) => puzzles.filter((p) => stateOf(p) === state).length
    return {
      due: puzzles
        .filter((p) => stateOf(p) === 'due')
        .slice(0, MAX_DUE)
        .map((p) => ({ ...p, line: { ...p.line, moves: [...p.line.moves] } })),
      waiting: count('waiting'),
      solved: count('solved'),
    }
  }

  async record({ startFen, moves, ply, solvedFirstTry }: TrainingResultBody): Promise<void> {
    const line = { startFen, moves }
    const progress = await this.library.trainingProgress()
    const next = afterAttempt(progress.get(this.key(line, ply)), solvedFirstTry, this.now())
    await this.library.saveTrainingProgress(line, ply, next)
  }

  private async puzzles(): Promise<(Puzzle & { explanation?: string })[]> {
    const { library } = this
    const [summaries, profile] = await Promise.all([library.summaries(), library.profile()])
    const games = playerGames(summaries, profile)
      .filter(({ game }) => game.reviewed)
      .slice(0, MAX_GAMES)
    const found = await Promise.all(
      games.map(async (game) => {
        const stored = await library.game(game.game.id)
        if (!stored) return []
        const line = gameLine(stored.pgn)
        const review = await library.findReview(line)
        if (!review) return []
        const why = await this.explanations(line, game.side, review.reviewedAt)
        return gamePuzzles(game, line, review.review).map((puzzle) => {
          const explanation = why.get(puzzle.ply)
          return explanation ? { ...puzzle, explanation } : puzzle
        })
      }),
    )
    return found.flat()
  }

  /**
   * Why the better move is better, by ply: the coach's walkthrough of the game tells it once the
   * user found the move, if it was written from this review and the moment is one it covers.
   */
  private async explanations(
    line: GameLine,
    side: string,
    reviewedAt: string,
  ): Promise<Map<number, string>> {
    for (const wanted of [side, 'both']) {
      const kept = await this.library.findWalkthrough(line, wanted)
      if (kept?.reviewedAt !== reviewedAt) continue
      return new Map(
        kept.walkthrough.moments.flatMap(({ ply, better }) => (better ? [[ply, better]] : [])),
      )
    }
    return new Map()
  }
}
