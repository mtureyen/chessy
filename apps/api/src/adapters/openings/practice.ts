import {
  formatSanLine,
  toSanLine,
  type GameReview,
  type OpeningBook,
  type ReviewInput,
} from '@pawnia/analysis'
import { createGame } from '@pawnia/chess'
import type { PracticeCheckBody, PracticeCheckRequest } from '@pawnia/contracts'
import { practiceVerdict, theoryChoices } from '@pawnia/history'

/** A move in the line or the try that isn't legal there. */
export class IllegalPracticeMoveError extends Error {
  constructor(move: string) {
    super(`${move} is not a legal move here`)
    this.name = 'IllegalPracticeMoveError'
  }
}

/** Half-moves of the engine's line shown with its choice. */
const LINE_MOVES = 4

/**
 * Judges moves tried while practising an opening: theory (the book) first, then the engine's
 * review of the move, as the user's own games are reviewed.
 */
export class OpeningPractice {
  private readonly book: () => Promise<OpeningBook | undefined>
  private readonly review: (input: ReviewInput) => Promise<GameReview>

  constructor(
    book: () => Promise<OpeningBook | undefined>,
    review: (input: ReviewInput) => Promise<GameReview>,
  ) {
    this.book = book
    this.review = review
  }

  async check({ moves, tried }: PracticeCheckRequest): Promise<PracticeCheckBody> {
    const book = await this.book()
    if (!book) throw new Error('No opening book on this server')
    const game = createGame()
    for (const move of moves) if (!game.play(move)) throw new IllegalPracticeMoveError(move)
    const fen = game.fen()
    const after = createGame(fen).play(tried)
    if (!after?.move) throw new IllegalPracticeMoveError(tried)
    const theory = theoryChoices(fen, book)
    const replies = theoryChoices(after.fen, book)
    const answer = { san: after.move.san, fen: after.fen, theory, replies }
    if (book.isBook(after.fen)) return { verdict: 'theory', ...answer }

    const [move] = (await this.review({ startFen: fen, moves: [tried] })).moves
    if (!move) throw new Error('The engine did not review the move')
    const best = move.best && {
      san: move.best.san,
      uci: move.best.uci,
      line: formatSanLine(toSanLine(fen, move.best.line, LINE_MOVES)),
    }
    return { verdict: practiceVerdict(move.classification), ...answer, ...(best && { best }) }
  }
}
