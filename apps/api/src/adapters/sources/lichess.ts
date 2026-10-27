import type { GameSource, PlayerInfo, SourceGame, Speed } from '@chessy/library'
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
