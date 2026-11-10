import type { GameSource, GameSpeed, Profile, SourceGame } from '@pawnia/library'
import { gameFacts } from '../domain/gameFacts'
import { playerGames, type GameSummary } from '../domain/playerGames'
import type { StatsGame } from '../domain/profileStats'

/** How far back a lookup reads someone's games. */
export const LOOKUP_MONTHS = 12

/**
 * History pages read at most: on chess.com a page is a month (so the months above are the
 * limit), on lichess 200 games.
 */
const MAX_PAGES: Record<GameSource['id'], number> = { chesscom: LOOKUP_MONTHS + 1, lichess: 3 }

export interface LookupOptions {
  /** The newest this many finished games. */
  last: number
  speed?: GameSpeed
  now: Date
}

export interface LookupGames {
  /** From the player's side, newest first, at most `last`. */
  games: StatsGame[]
  /** ISO: the oldest day read. */
  since: string
  /** Whether games older than these are left unread (fewer found than asked for). */
  more: boolean
}

/**
 * Anyone's newest finished games on a platform, read live a page at a time (one request after
 * the other), with what their moves tell. Nothing is stored. Throws what GameSource.history does.
 */
export async function lookupGames(
  source: GameSource,
  username: string,
  { last, speed, now }: LookupOptions,
): Promise<LookupGames> {
  const from = new Date(now)
  from.setUTCMonth(from.getUTCMonth() - LOOKUP_MONTHS)
  const since = from.toISOString()
  const profile: Profile = {
    id: '',
    displayName: username,
    accounts: [{ source: source.id, username }],
    createdAt: since,
    updatedAt: since,
  }
  const found: StatsGame[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const page = await source.history(username, { since, ...(cursor && { cursor }) })
    pages++
    cursor = page.next
    const pgns = new Map(page.games.map((g) => [g.externalId, g.pgn]))
    for (const game of playerGames(page.games.map(summaryOf), profile)) {
      if (found.length === last) break
      if (game.outcome === 'unfinished' || (speed && game.game.speed !== speed)) continue
      const pgn = pgns.get(game.game.id)
      const facts = pgn === undefined ? undefined : gameFacts(pgn, game.game.result)
      found.push({ ...game, ...(facts && { facts }) })
    }
  } while (cursor && found.length < last && pages < MAX_PAGES[source.id])
  return { games: found, since, more: found.length < last && cursor !== undefined }
}

function summaryOf(game: SourceGame): GameSummary {
  return {
    id: game.externalId,
    source: game.source,
    playedAt: game.playedAt,
    white: game.white,
    black: game.black,
    result: game.result,
    speed: game.speed,
    ...(game.timeControl && { timeControl: game.timeControl }),
    rated: game.rated,
    ...(game.opening && { opening: game.opening }),
    url: game.url,
    reviewed: false,
  }
}
