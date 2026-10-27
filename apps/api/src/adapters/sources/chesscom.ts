import type { GameSource, PlayerInfo, SourceGame, Speed } from '@chessy/library'
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
const MonthSchema = z.object({ games: z.array(z.unknown()) })

const SPEEDS: Record<string, Speed> = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  daily: 'correspondence',
}

/** Archives are monthly; look back at most this many months with games. */
const MAX_MONTHS = 3

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
  const name = words.join(' ') || undefined
  return eco || name ? { eco, name } : undefined
}
