import type { OpeningBook } from '@pawnia/analysis'
import type { OpeningBody, OpeningsBody } from '@pawnia/contracts'
import {
  afterOpening,
  gameLine,
  openingDetail,
  openingOverview,
  openingPath,
  playerGames,
  recentGames,
  type GameHistory,
  type GameLine,
  type OpeningGame,
  type OpeningPath,
  type StoredReview,
} from '@pawnia/history'
import type { Profile } from '@pawnia/library'
import type { OpeningService, OpeningsQuery } from './openingService'

/** What the opening numbers are read from: the stored history. */
export interface OpeningsLibrary extends Pick<GameHistory, 'summaries'> {
  profile(): Promise<Profile | undefined>
  pgns(ids: readonly string[]): Promise<Map<string, string>>
  findReview(line: GameLine): Promise<StoredReview | undefined>
}

/**
 * The user's openings from their stored games and the opening book. Each game's way through the
 * book is worked out once (stored games don't change).
 */
export class StoredOpenings implements OpeningService {
  private readonly library: OpeningsLibrary
  private readonly book: () => Promise<OpeningBook | undefined>
  private readonly paths = new Map<string, { path: OpeningPath | null; pgn: string }>()

  constructor(library: OpeningsLibrary, book: () => Promise<OpeningBook | undefined>) {
    this.library = library
    this.book = book
  }

  async openings(query: OpeningsQuery): Promise<OpeningsBody> {
    const games = await this.games(query)
    return { window: windowOf(query, games), openings: openingOverview(games) }
  }

  async opening(
    color: 'white' | 'black',
    family: string,
    query: OpeningsQuery,
  ): Promise<OpeningBody | undefined> {
    const games = await this.games(query)
    const detail = openingDetail(games, color, family)
    if (!detail) return undefined
    const reviewed = games.filter(
      (g) =>
        g.side === color && g.game.reviewed && detail.games.some((row) => row.id === g.game.id),
    )
    const reviews = await Promise.all(
      reviewed.map(async (game) => {
        const pgn = this.paths.get(game.game.id)?.pgn
        const stored = pgn === undefined ? undefined : await this.library.findReview(gameLine(pgn))
        return stored ? [{ side: game.side, review: stored.review }] : []
      }),
    )
    return { window: windowOf(query, games), ...detail, after: afterOpening(reviews.flat()) }
  }

  /** The newest finished platform games with their way through the book. */
  private async games({ last, speed }: OpeningsQuery): Promise<OpeningGame[]> {
    const book = await this.book()
    if (!book) throw new Error('No opening book on this server')
    const [summaries, profile] = await Promise.all([
      this.library.summaries(),
      this.library.profile(),
    ])
    const platform = playerGames(summaries, profile).filter(
      (game) => game.category === 'chesscom' || game.category === 'lichess',
    )
    const chosen = recentGames(platform, { count: last, ...(speed && { speed }) })
    const missing = chosen.map((g) => g.game.id).filter((id) => !this.paths.has(id))
    if (missing.length > 0) {
      const pgns = await this.library.pgns(missing)
      for (const [id, pgn] of pgns)
        this.paths.set(id, { path: openingPath(pgn, book) ?? null, pgn })
    }
    return chosen.map((game) => {
      const path = this.paths.get(game.game.id)?.path
      return path ? { ...game, path } : game
    })
  }
}

function windowOf({ last, speed }: OpeningsQuery, games: readonly OpeningGame[]) {
  return { last, ...(speed && { speed }), found: games.length }
}
