import {
  GameNotFoundError,
  type GameSource,
  type PlayerInfo,
  type PlayerProfile,
  type RatedSpeed,
  type SourceGame,
  type Speed,
} from '@chessy/library'
import { z } from 'zod'
import { get, pgnResult, type HttpSourceOptions } from './http'

const PlayerSchema = z.object({
  user: z.object({ name: z.string() }).optional(),
  rating: z.number().optional(),
  aiLevel: z.number().optional(),
})

/** The fields we use from lichess' game export (NDJSON, `pgnInJson=true`). */
const LichessGameSchema = z.object({
  id: z.string(),
  rated: z.boolean(),
  variant: z.string(),
  speed: z.string(),
  createdAt: z.number(),
  players: z.object({ white: PlayerSchema, black: PlayerSchema }),
  opening: z.object({ eco: z.string().optional(), name: z.string().optional() }).optional(),
  clock: z.object({ initial: z.number(), increment: z.number() }).optional(),
  pgn: z.string(),
})

const UserSchema = z.object({
  username: z.string(),
  url: z.string(),
  title: z.string().optional(),
  profile: z
    .object({ flag: z.string().optional(), realName: z.string().optional() })
    .passthrough()
    .optional(),
  perfs: z
    .record(z.string(), z.object({ rating: z.number(), games: z.number() }).passthrough())
    .default({}),
})

const RATED_SPEEDS: readonly RatedSpeed[] = [
  'bullet',
  'blitz',
  'rapid',
  'classical',
  'correspondence',
]

/** Variants our rules core can replay; everything else (chess960, atomic, …) is skipped. */
const SUPPORTED_VARIANTS = new Set(['standard', 'fromPosition'])

const SPEEDS: Record<string, Speed> = {
  ultraBullet: 'ultrabullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'correspondence',
}

export interface LichessOptions extends HttpSourceOptions {
  baseUrl?: string
}

/** Recent games via https://lichess.org/api#tag/Games/operation/apiGamesUser */
export class LichessGameSource implements GameSource {
  readonly id = 'lichess' as const
  private readonly options: LichessOptions

  constructor(options: LichessOptions) {
    this.options = options
  }

  async recentGames(username: string, { max }: { max: number }): Promise<SourceGame[]> {
    const base = this.options.baseUrl ?? 'https://lichess.org'
    const query = new URLSearchParams({
      max: String(max),
      pgnInJson: 'true',
      clocks: 'true',
      opening: 'true',
    })
    const url = `${base}/api/games/user/${encodeURIComponent(username)}?${query}`
    const res = await get('lichess', url, username, this.options, 'application/x-ndjson')
    const lines = (await res.text()).split('\n').filter((line) => line.trim())
    return lines.flatMap((line) => {
      const parsed = LichessGameSchema.safeParse(JSON.parse(line))
      return parsed.success && SUPPORTED_VARIANTS.has(parsed.data.variant)
        ? [toSourceGame(parsed.data)]
        : []
    })
  }

  /** One game via https://lichess.org/api#tag/Games/operation/gamePgn (as JSON). */
  async game(id: string): Promise<SourceGame> {
    const base = this.options.baseUrl ?? 'https://lichess.org'
    const query = new URLSearchParams({ pgnInJson: 'true', clocks: 'true', opening: 'true' })
    const url = `${base}/game/export/${encodeURIComponent(id)}?${query}`
    const notFound = (detail?: string) => new GameNotFoundError('lichess', id, detail)
    const res = await get('lichess', url, '', this.options, 'application/json', () => notFound())
    const parsed = LichessGameSchema.safeParse(await res.json())
    if (!parsed.success) throw notFound('unexpected answer')
    if (!SUPPORTED_VARIANTS.has(parsed.data.variant))
      throw notFound(`${parsed.data.variant} is not supported`)
    return toSourceGame(parsed.data)
  }

  /** Via https://lichess.org/api#tag/Users/operation/apiUser; lichess has no avatars. */
  async player(username: string): Promise<PlayerProfile> {
    const base = this.options.baseUrl ?? 'https://lichess.org'
    const url = `${base}/api/user/${encodeURIComponent(username)}`
    const user = UserSchema.parse(await (await get('lichess', url, username, this.options)).json())
    const ratings: PlayerProfile['ratings'] = {}
    for (const speed of RATED_SPEEDS) {
      const perf = user.perfs[speed]
      // A rating without games is lichess' starting value, not the player's.
      if (perf && perf.games > 0) ratings[speed] = perf.rating
    }
    const flag = user.profile?.flag
    return {
      source: 'lichess',
      username: user.username,
      url: user.url,
      ...(user.title && { title: user.title }),
      ...(user.profile?.realName && { name: user.profile.realName }),
      // Flags are ISO codes, or lichess' own (e.g. "_earth").
      ...(flag && /^[A-Z]{2}$/.test(flag) && { country: flag }),
      ratings,
    }
  }
}

function toSourceGame(game: z.infer<typeof LichessGameSchema>): SourceGame {
  return {
    source: 'lichess',
    externalId: game.id,
    url: `https://lichess.org/${game.id}`,
    pgn: game.pgn,
    white: player(game.players.white),
    black: player(game.players.black),
    result: pgnResult(game.pgn),
    speed: SPEEDS[game.speed] ?? 'classical',
    timeControl: game.clock ? `${game.clock.initial}+${game.clock.increment}` : undefined,
    rated: game.rated,
    playedAt: new Date(game.createdAt).toISOString(),
    opening: game.opening ? { eco: game.opening.eco, name: game.opening.name } : undefined,
  }
}

function player(p: z.infer<typeof PlayerSchema>): PlayerInfo {
  const name = p.user?.name ?? (p.aiLevel ? `Stockfish level ${p.aiLevel}` : 'Anonymous')
  return p.rating === undefined ? { name } : { name, rating: p.rating }
}
