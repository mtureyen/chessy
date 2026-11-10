import type { PlayerStatsBody } from '@pawnia/contracts'
import {
  gameFacts,
  lookupGames,
  moveQuality,
  playerGames,
  profileStats,
  recentGames,
  repertoireLines,
  type GameFacts,
  type GameHistory,
  type LookupGames,
  type StatsGame,
} from '@pawnia/history'
import {
  LOCAL_PLAYER_NAME,
  type GameSource,
  type PlayerProfile,
  type Profile,
  type SourceId,
} from '@pawnia/library'
import type { StatsQuery, StatsService } from './statsService'

/** What the user's own numbers are read from: the stored history. */
export interface StatsLibrary extends Pick<GameHistory, 'summaries' | 'reviewedMoves'> {
  profile(): Promise<Profile | undefined>
  /** The PGNs of these stored games, by id. */
  pgns(ids: readonly string[]): Promise<Map<string, string>>
}

/** How long a lookup's games are kept: someone's games don't change by the minute. */
const LOOKUP_CACHE_MS = 10 * 60_000
/** The most lookups kept at once (the oldest goes first). */
const LOOKUP_CACHE_SIZE = 50

interface Lookup {
  profile: PlayerProfile
  games: LookupGames
}

/**
 * The stats page's numbers. Own games come from the database (what their moves tell is kept per
 * game, as stored games don't change); anyone else's are read live and kept for a few minutes.
 */
export class LiveStats implements StatsService {
  private readonly library: StatsLibrary
  private readonly sources: Record<SourceId, GameSource>
  private readonly now: () => number
  private readonly facts = new Map<string, GameFacts | null>()
  private readonly lookups = new Map<string, { at: number; lookup: Promise<Lookup> }>()

  constructor(deps: {
    library: StatsLibrary
    sources: Record<SourceId, GameSource>
    now?: () => number
  }) {
    this.library = deps.library
    this.sources = deps.sources
    this.now = deps.now ?? Date.now
  }

  async mine({ last, speed, tz }: StatsQuery): Promise<PlayerStatsBody> {
    const [summaries, profile, moves] = await Promise.all([
      this.library.summaries(),
      this.library.profile(),
      this.library.reviewedMoves(),
    ])
    // Games on the platforms: bot and two-player games here are practice, not the record.
    const platform = playerGames(summaries, profile).filter(
      (game) => game.category === 'chesscom' || game.category === 'lichess',
    )
    const chosen = recentGames(platform, { count: last, ...(speed && { speed }) })
    const games = await this.withFacts(chosen)
    const quality = moveQuality(games, moves)
    const accuracy = games
      .flatMap(({ game, side }) => {
        const value = game.reviewed ? game.accuracy?.[side] : undefined
        return value === undefined ? [] : [{ at: game.playedAt, accuracy: value }]
      })
      .reverse()
    return {
      player: {
        kind: 'me',
        displayName: profile?.displayName ?? LOCAL_PLAYER_NAME,
        accounts: profile?.accounts ?? [],
      },
      window: { last, ...(speed && { speed }), found: games.length },
      ...stats(games, tz),
      ...(quality.reviewedGames > 0 && { quality: { ...quality, accuracy } }),
    }
  }

  async player(source: SourceId, username: string, query: StatsQuery): Promise<PlayerStatsBody> {
    const { last, speed, tz } = query
    const { profile, games } = await this.lookup(source, username, { last, speed })
    return {
      player: { kind: 'lookup', profile },
      window: {
        last,
        ...(speed && { speed }),
        found: games.games.length,
        since: games.since,
        more: games.more,
      },
      ...stats(games.games, tz),
    }
  }

  /** The games of a lookup, from the cache while fresh; a failed one isn't kept. */
  private lookup(
    source: SourceId,
    username: string,
    { last, speed }: Pick<StatsQuery, 'last' | 'speed'>,
  ): Promise<Lookup> {
    const key = [source, username.toLowerCase(), last, speed ?? ''].join(' ')
    const now = this.now()
    const cached = this.lookups.get(key)
    if (cached && now - cached.at < LOOKUP_CACHE_MS) return cached.lookup
    this.lookups.delete(key)
    const platform = this.sources[source]
    const lookup = (async () => {
      // The profile first: an unknown user fails fast, and it spells the name as the platform does.
      const profile = await platform.player(username)
      const games = await lookupGames(platform, profile.username, {
        last,
        ...(speed && { speed }),
        now: new Date(now),
      })
      return { profile, games }
    })()
    this.lookups.set(key, { at: now, lookup })
    lookup.catch(() => {
      if (this.lookups.get(key)?.lookup === lookup) this.lookups.delete(key)
    })
    while (this.lookups.size > LOOKUP_CACHE_SIZE) {
      this.lookups.delete(this.lookups.keys().next().value!)
    }
    return lookup
  }

  /** The games with what their moves tell, reading only the PGNs not seen before. */
  private async withFacts(games: readonly StatsGame[]): Promise<StatsGame[]> {
    const missing = games.map((g) => g.game.id).filter((id) => !this.facts.has(id))
    if (missing.length > 0) {
      const pgns = await this.library.pgns(missing)
      for (const game of games) {
        const pgn = pgns.get(game.game.id)
        if (pgn !== undefined)
          this.facts.set(game.game.id, gameFacts(pgn, game.game.result) ?? null)
      }
    }
    return games.map((game) => {
      const facts = this.facts.get(game.game.id)
      return facts ? { ...game, facts } : game
    })
  }
}

/** The numbers both kinds share, with the repertoire as lines for the wire. */
function stats(games: readonly StatsGame[], timeZone: string) {
  const { repertoire, ...rest } = profileStats(games, timeZone)
  return {
    ...rest,
    repertoire: {
      white: repertoireLines(repertoire.white),
      black: repertoireLines(repertoire.black),
    },
  }
}
