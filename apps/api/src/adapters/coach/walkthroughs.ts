import type { GameReview, OpeningBook } from '@chessy/analysis'
import type { Color } from '@chessy/chess'
import {
  writeWalkthrough,
  type CancelSignal,
  type CoachAgent,
  type WalkthroughFacts,
} from '@chessy/coach'
import type { CoachWalkthroughBody, CoachWalkthroughRequestBody } from '@chessy/contracts'
import {
  filterGames,
  groupGames,
  lastBookPly,
  momentFacts,
  openingFamily,
  phaseAccuracy,
  playerGames,
  walkthroughMoves,
  type GameHistory,
  type GameLine,
  type StoredReview,
} from '@chessy/history'
import type { Profile } from '@chessy/library'
import type { StoredWalkthrough } from '../db/walkthroughStore'
import { NoStoredReviewError, type WalkthroughService } from './walkthroughService'

export interface WalkthroughLibrary extends Pick<GameHistory, 'summaries'> {
  profile(): Promise<Profile | undefined>
  findReview(line: GameLine): Promise<StoredReview | undefined>
  findWalkthrough(line: GameLine, side: string): Promise<StoredWalkthrough | undefined>
  saveWalkthrough(line: GameLine, side: string, stored: StoredWalkthrough): Promise<void>
}

/**
 * Walkthroughs written from the stored review and kept in the history. Everything the coach says
 * rests on the facts built here; what it draws comes from the review, not from it.
 */
export class StoredWalkthroughs implements WalkthroughService {
  private readonly library: WalkthroughLibrary
  private readonly book: () => Promise<OpeningBook | undefined>
  private readonly now: () => Date

  constructor(
    library: WalkthroughLibrary,
    book: () => Promise<OpeningBook | undefined>,
    now: () => Date = () => new Date(),
  ) {
    this.library = library
    this.book = book
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

  private async review({ startFen, moves }: CoachWalkthroughRequestBody): Promise<StoredReview> {
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
