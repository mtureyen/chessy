import {
  formatSanLine,
  toSanLine,
  type GameReview,
  type OpeningBook,
  type ReviewedMove,
  type ReviewInput,
} from '@pawnia/analysis'
import { createGame, mostExposedPiece, type Color } from '@pawnia/chess'
import {
  triedText,
  TRY_PROMPT,
  writeWalkthrough,
  type CancelSignal,
  type CoachAgent,
  type WalkthroughFacts,
} from '@pawnia/coach'
import type {
  CoachTryBody,
  CoachTryRequestBody,
  CoachWalkthroughBody,
  CoachWalkthroughRequestBody,
} from '@pawnia/contracts'
import {
  filterGames,
  groupGames,
  lastBookPly,
  momentFacts,
  openingFamily,
  phaseAccuracy,
  playerGames,
  tryVerdict,
  walkthroughMoves,
  type GameHistory,
  type GameLine,
  type StoredReview,
} from '@pawnia/history'
import type { Profile } from '@pawnia/library'
import type { StoredTry } from '../db/tryStore'
import type { StoredWalkthrough } from '../db/walkthroughStore'
import { IllegalTryError, NoStoredReviewError, type WalkthroughService } from './walkthroughService'

export interface WalkthroughLibrary extends Pick<GameHistory, 'summaries'> {
  profile(): Promise<Profile | undefined>
  findReview(line: GameLine): Promise<StoredReview | undefined>
  findWalkthrough(line: GameLine, side: string): Promise<StoredWalkthrough | undefined>
  saveWalkthrough(line: GameLine, side: string, stored: StoredWalkthrough): Promise<void>
  findTry(line: GameLine, ply: number, tried: string): Promise<StoredTry | undefined>
  saveTry(line: GameLine, ply: number, tried: string, stored: StoredTry): Promise<void>
}

/** What judging a tried move takes: a review of it, and the engine's answer to it (UCI). */
export interface TryJudge {
  review(input: ReviewInput): Promise<GameReview>
  bestReply(fen: string): Promise<readonly string[]>
}

/** Moves of the engine's answer the coach gets to see. */
const REPLY_MOVES = 4

/**
 * Walkthroughs written from the stored review and kept in the history. Everything the coach says
 * rests on the facts built here; what it draws comes from the review, not from it.
 */
export class StoredWalkthroughs implements WalkthroughService {
  private readonly library: WalkthroughLibrary
  private readonly book: () => Promise<OpeningBook | undefined>
  private readonly tries: TryJudge
  private readonly now: () => Date

  constructor(
    library: WalkthroughLibrary,
    book: () => Promise<OpeningBook | undefined>,
    tries: TryJudge,
    now: () => Date = () => new Date(),
  ) {
    this.library = library
    this.book = book
    this.tries = tries
    this.now = now
  }

  async find(request: CoachWalkthroughRequestBody): Promise<CoachWalkthroughBody | undefined> {
    const stored = await this.review(request)
    const kept = await this.library.findWalkthrough(stored.line, request.side ?? 'both')
    return kept?.reviewedAt === stored.reviewedAt ? kept.walkthrough : undefined
  }

  async write(
    request: CoachWalkthroughRequestBody,
    agent: CoachAgent,
    signal?: CancelSignal,
  ): Promise<CoachWalkthroughBody> {
    const { line, review, reviewedAt } = await this.review(request)
    const { side } = request
    const opening = await this.opening(review, side)
    const facts = this.facts(review, side, opening)
    const { opening: openingText, ...written } = await writeWalkthrough(agent, facts, signal)
    const walkthrough: CoachWalkthroughBody = {
      ...written,
      ...(opening &&
        openingText && {
          opening: {
            name: opening.name,
            ply: opening.ply,
            text: openingText,
            ...(opening.record && { record: opening.record }),
          },
        }),
      agent: agent.label,
      writtenAt: this.now().toISOString(),
    }
    await this.library.saveWalkthrough(line, side ?? 'both', { reviewedAt, walkthrough })
    return walkthrough
  }

  async judge(
    { startFen, moves, ply, tried }: CoachTryRequestBody,
    agent: CoachAgent | undefined,
    signal?: CancelSignal,
  ): Promise<CoachTryBody> {
    const { line, review, reviewedAt } = await this.review({ startFen, moves })
    const moment = review.moves.find((move) => move.ply === ply)
    const fen = review.positions[ply - 1]?.fen
    if (!moment || !fen) throw new NoStoredReviewError()
    const after = createGame(fen).play(tried)
    if (!after?.move) throw new IllegalTryError(tried)
    const answer = { san: after.move.san, fen: after.fen }
    if (tried === moment.uci) return { verdict: 'played', ...answer }
    if (tried === moment.best?.uci) return { verdict: 'right', ...answer }

    // The same move tried again gets the same answer, without the engine or the coach.
    const kept = await this.library.findTry(line, ply, tried)
    if (kept?.reviewedAt === reviewedAt) return kept.judged
    const judged = await this.judgeOther(fen, moment, tried, answer, agent, signal)
    // A wrong try the coach said nothing on is asked again: it may have something to say then.
    if (judged.verdict !== 'wrong' || judged.comment) {
      await this.library.saveTry(line, ply, tried, { reviewedAt, judged })
    }
    return judged
  }

  /** A move that is neither the one played nor the better one: the review and the coach judge. */
  private async judgeOther(
    fen: string,
    moment: ReviewedMove,
    tried: string,
    answer: { san: string; fen: string },
    agent: CoachAgent | undefined,
    signal: CancelSignal | undefined,
  ): Promise<CoachTryBody> {
    const { rating } = moment.facts
    const judged = await this.tries.review({
      startFen: fen,
      moves: [tried],
      ...(rating && { ratings: { [moment.color]: rating } }),
    })
    const move = judged.moves[0]!
    const verdict = tryVerdict(move.classification)
    if (verdict !== 'wrong' || !agent) return { verdict, ...answer }

    const reply = formatSanLine(
      toSanLine(answer.fen, await this.tries.bestReply(answer.fen), REPLY_MOVES),
    )
    const exposed = mostExposedPiece(answer.fen, moment.color)
    const comment = await agent
      .compose({
        system: TRY_PROMPT,
        text: triedText({
          fen,
          tried: answer.san,
          played: moment.san,
          verdict: move.classification,
          winBefore: Math.round(move.winBefore),
          winAfter: Math.round(move.winAfter),
          ...(reply && { bestReply: reply }),
          ...(exposed && {
            hanging: { piece: exposed.role, square: exposed.square, pawns: exposed.gain },
          }),
          ...(rating && { rating }),
        }),
        ...(signal && { signal }),
      })
      // The verdict stands without the coach's words.
      .catch(() => undefined)
    return { verdict, ...answer, ...(comment && { comment }) }
  }

  private async review({
    startFen,
    moves,
  }: Pick<CoachWalkthroughRequestBody, 'startFen' | 'moves'>): Promise<StoredReview> {
    const stored = await this.library.findReview({ startFen, moves })
    if (!stored) throw new NoStoredReviewError()
    return stored
  }

  private facts(
    review: GameReview,
    side: Color | undefined,
    opening: Awaited<ReturnType<StoredWalkthroughs['opening']>>,
  ): WalkthroughFacts {
    const rating = side && review.moves.find((move) => move.color === side)?.facts.rating
    const accuracy = (color: Color) => {
      const value = review.accuracy[color]
      return value === undefined ? {} : { [color]: Math.round(value) }
    }
    return {
      ...(side && { side, phases: phaseAccuracy(review, side) }),
      ...(rating && { rating }),
      accuracy: { ...accuracy('white'), ...accuracy('black') },
      ...(opening && {
        opening: { name: opening.name, ...(opening.record && { record: opening.record }) },
      }),
      moments: walkthroughMoves(review, side).map((move) => momentFacts(review, move)),
    }
  }

  /** The named opening the game reached, and the user's results with it as this colour. */
  private async opening(review: GameReview, side: Color | undefined) {
    const ply = lastBookPly(review)
    const book = await this.book()
    if (!ply || !book) return undefined
    for (let at = ply; at > 0; at--) {
      const fen = review.positions[at]?.fen
      const named = fen ? book.opening(fen) : undefined
      if (named) {
        const record = side && (await this.record(named.name, side))
        return { name: named.name, ply, ...(record && { record }) }
      }
    }
    return undefined
  }

  private async record(opening: string, side: Color) {
    const [summaries, profile] = await Promise.all([
      this.library.summaries(),
      this.library.profile(),
    ])
    const games = filterGames(playerGames(summaries, profile), { color: side })
    const family = openingFamily(opening)
    const group = groupGames(games, 'opening').find(
      (g) => sameSpelling(g.key) === sameSpelling(family),
    )
    if (!group) return undefined
    const { games: played, wins, draws, losses } = group.tally
    return { of: family, games: played, wins, draws, losses }
  }
}

/** The platforms spell openings differently ("King's Pawn", "Kings Pawn"). */
function sameSpelling(name: string): string {
  return name.toLowerCase().replace(/[^a-z ]/g, '')
}
