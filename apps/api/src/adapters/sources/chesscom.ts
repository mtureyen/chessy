import {
  GameNotFoundError,
  type GameSource,
  type HistoryPage,
  type PlayerInfo,
  type PlayerProfile,
  type RatedSpeed,
  type SourceGame,
  type Speed,
} from '@pawnia/library'
import { z } from 'zod'
import { get, pgnResult, pgnTag, type HttpSourceOptions } from './http'

const PlayerSchema = z.object({ username: z.string(), rating: z.number().optional() })

/** The fields we use from chess.com's monthly archive (https://www.chess.com/news/view/published-data-api). */
const ChessComGameSchema = z.object({
  url: z.string(),
  uuid: z.string(),
  pgn: z.string(),
  time_control: z.string(),
  time_class: z.string(),
  end_time: z.number(),
  rated: z.boolean(),
  rules: z.string(),
  eco: z.string().optional(),
  white: PlayerSchema,
  black: PlayerSchema,
})

const ArchivesSchema = z.object({ archives: z.array(z.string()) })

const ProfileSchema = z.object({
  username: z.string(),
  url: z.string(),
  name: z.string().optional(),
  title: z.string().optional(),
  avatar: z.string().optional(),
  /** A URL ending in the country code, e.g. ".../pub/country/DE". */
  country: z.string().optional(),
})

/** Stats mix categories with other values (e.g. `fide`: a number): read only the categories. */
const StatsSchema = z.record(z.string(), z.unknown())
const CategorySchema = z.object({ last: z.object({ rating: z.number() }) })

/** chess.com's rating categories for standard chess. */
const RATED_SPEEDS: Record<string, RatedSpeed> = {
  chess_bullet: 'bullet',
  chess_blitz: 'blitz',
  chess_rapid: 'rapid',
  chess_daily: 'correspondence',
}
const MonthSchema = z.object({ games: z.array(z.unknown()) })

const SPEEDS: Record<string, Speed> = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  daily: 'correspondence',
}

/** Archives are monthly; look back at most this many months with games. */
const MAX_MONTHS = 3
/** How far back a single game is looked for in the user's archives. */
const MAX_LOOKUP_MONTHS = 12

export interface ChessComOptions extends HttpSourceOptions {
  baseUrl?: string
}

/** Recent games from chess.com's read-only Published-Data API (no playing, no auth). */
export class ChessComGameSource implements GameSource {
  readonly id = 'chesscom' as const
  private readonly options: ChessComOptions

  constructor(options: ChessComOptions) {
    this.options = options
  }

  async recentGames(username: string, { max }: { max: number }): Promise<SourceGame[]> {
    const base = this.options.baseUrl ?? 'https://api.chess.com'
    const archivesUrl = `${base}/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`
    const { archives } = ArchivesSchema.parse(await this.json(archivesUrl, username))

    const games: z.infer<typeof ChessComGameSchema>[] = []
    // Archives are listed oldest first; a month's games too.
    for (const monthUrl of archives.slice(-MAX_MONTHS).reverse()) {
      const month = MonthSchema.parse(await this.json(monthUrl, username))
      const standard = month.games
        .map((raw) => ChessComGameSchema.safeParse(raw))
        .flatMap((parsed) => (parsed.success && parsed.data.rules === 'chess' ? [parsed.data] : []))
        .sort((a, b) => b.end_time - a.end_time)
      games.push(...standard)
      if (games.length >= max) break
    }
    return games.slice(0, max).map(toSourceGame)
  }

  /**
   * The whole history a month at a time, newest first. The cursor carries the months still to
   * fetch ("<total>:2026/09,2026/08,…"), so the archive list is fetched only once.
   */
  async history(
    username: string,
    { cursor, since }: { cursor?: string; since?: string },
  ): Promise<HistoryPage> {
    const base = this.options.baseUrl ?? 'https://api.chess.com'
    const user = `${base}/pub/player/${encodeURIComponent(username.toLowerCase())}`
    let total: number
    let months: string[]
    if (cursor) {
      const [count, list = ''] = cursor.split(':')
      total = Number(count)
      months = list.split(',').filter(Boolean)
    } else {
      const { archives } = ArchivesSchema.parse(await this.json(`${user}/games/archives`, username))
      const from = since?.slice(0, 7).replace('-', '/')
      months = archives
        .map((url) => url.split('/games/')[1] ?? '')
        .filter((month) => /^\d{4}\/\d{2}$/.test(month) && (!from || month >= from))
        .reverse()
      total = months.length
    }
    const [month, ...rest] = months
    if (!month) return { games: [], progress: { done: total, total } }
    const raw = MonthSchema.parse(await this.json(`${user}/games/${month}`, username))
    const games = raw.games
      .map((game) => ChessComGameSchema.safeParse(game))
      .flatMap((parsed) => (parsed.success && parsed.data.rules === 'chess' ? [parsed.data] : []))
      .sort((a, b) => b.end_time - a.end_time)
      .map(toSourceGame)
      .filter((game) => !since || game.playedAt >= since)
    return {
      games,
      ...(rest.length > 0 && { next: `${total}:${rest.join(',')}` }),
      progress: { done: total - rest.length, total },
    }
  }

  /**
   * One of the user's games by the number in its URL. The published API has no lookup by game,
   * so the user's monthly archives are searched, newest first.
   */
  async game(id: string, { username }: { username?: string }): Promise<SourceGame> {
    if (!username) throw new GameNotFoundError('chesscom', id, 'needs the player’s username')
    const base = this.options.baseUrl ?? 'https://api.chess.com'
    const archivesUrl = `${base}/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`
    const { archives } = ArchivesSchema.parse(await this.json(archivesUrl, username))
    for (const monthUrl of archives.slice(-MAX_LOOKUP_MONTHS).reverse()) {
      const month = MonthSchema.parse(await this.json(monthUrl, username))
      for (const raw of month.games) {
        const parsed = ChessComGameSchema.safeParse(raw)
        if (!parsed.success || !parsed.data.url.endsWith(`/${id}`)) continue
        if (parsed.data.rules !== 'chess') {
          throw new GameNotFoundError('chesscom', id, `${parsed.data.rules} is not supported`)
        }
        return toSourceGame(parsed.data)
      }
    }
    throw new GameNotFoundError(
      'chesscom',
      id,
      `not among ${username}'s games of the last ${MAX_LOOKUP_MONTHS} months`,
    )
  }

  /** The account's public profile and current ratings (two requests). */
  async player(username: string): Promise<PlayerProfile> {
    const base = this.options.baseUrl ?? 'https://api.chess.com'
    const user = `${base}/pub/player/${encodeURIComponent(username.toLowerCase())}`
    const profile = ProfileSchema.parse(await this.json(user, username))
    const stats = StatsSchema.parse(await this.json(`${user}/stats`, username))
    const ratings: PlayerProfile['ratings'] = {}
    for (const [key, speed] of Object.entries(RATED_SPEEDS)) {
      const category = CategorySchema.safeParse(stats[key])
      if (category.success) ratings[speed] = category.data.last.rating
    }
    // The member URL spells the username as the player does ("…/member/Hikaru").
    const spelled = profile.url.split('/member/')[1]
    return {
      source: 'chesscom',
      username: spelled && spelled.toLowerCase() === profile.username ? spelled : profile.username,
      url: profile.url,
      ...(profile.title && { title: profile.title }),
      ...(profile.name && { name: profile.name }),
      ...(profile.avatar && { avatarUrl: profile.avatar }),
      ...(profile.country && { country: profile.country.split('/').pop() }),
      ratings,
    }
  }

  private async json(url: string, username: string): Promise<unknown> {
    return (await get('chesscom', url, username, this.options)).json()
  }
}

function toSourceGame(game: z.infer<typeof ChessComGameSchema>): SourceGame {
  const daily = game.time_class === 'daily'
  return {
    source: 'chesscom',
    externalId: game.uuid,
    url: game.url,
    pgn: game.pgn,
    white: player(game.white),
    black: player(game.black),
    result: pgnResult(game.pgn),
    speed: SPEEDS[game.time_class] ?? 'classical',
    timeControl: daily ? undefined : game.time_control,
    rated: game.rated,
    playedAt: new Date(game.end_time * 1000).toISOString(),
    opening: opening(game),
  }
}

function player(p: z.infer<typeof PlayerSchema>): PlayerInfo {
  return p.rating === undefined ? { name: p.username } : { name: p.username, rating: p.rating }
}

/**
 * chess.com names openings only via a URL slug, e.g.
 * ".../Kings-Indian-Attack-Double-Fianchetto-Variation-3.d4-Bg7" → "Kings Indian Attack Double Fianchetto Variation".
 * The move part can also hang off a word: "...-Modern-Variation...9.Nc3-Bg7".
 */
function opening(game: z.infer<typeof ChessComGameSchema>): SourceGame['opening'] {
  const eco = pgnTag(game.pgn, 'ECO')
  const slug = game.eco?.split('/openings/')[1]
  const words: string[] = []
  for (const word of slug?.split('-') ?? []) {
    const moves = /\d+\./.exec(word)
    const kept = (moves ? word.slice(0, moves.index) : word).replace(/\.+$/, '')
    if (kept) words.push(kept)
    if (moves) break
  }
  const slugName = words.join(' ')
  // chess.com's URL for a game it knows no opening of ends in "Undefined".
  const name = slugName && slugName !== 'Undefined' ? slugName : undefined
  return eco || name ? { eco, name } : undefined
}
