import type { Color } from '@chessy/chess'
import {
  categoryOf,
  sideOf,
  type GameCategory,
  type GameOrigin,
  type GameResult,
  type GameSpeed,
  type PlayerInfo,
  type Profile,
} from '@chessy/library'

/** A stored game without its moves: enough to find it and count it. */
export interface GameSummary {
  id: string
  source: GameOrigin
  /** ISO timestamp. */
  playedAt: string
  white: PlayerInfo
  black: PlayerInfo
  result: GameResult
  speed: GameSpeed
  timeControl?: string
  rated: boolean
  opening?: { eco?: string; name?: string }
  url?: string
  /** Whether its main line has a review; then also the accuracy per side. */
  reviewed: boolean
  accuracy?: Partial<Record<Color, number>>
}

export type PlayerOutcome = 'win' | 'loss' | 'draw' | 'unfinished'

/** A game the user played, seen from their side. */
export interface PlayerGame {
  game: GameSummary
  category: GameCategory
  side: Color
  outcome: PlayerOutcome
  /** The user's rating in it, if the platform gave one. */
  rating?: number
  opponent: PlayerInfo
}

/** Without a profile only games played here (as "You") are known to be the user's. */
const NO_PROFILE: Profile = { id: '', displayName: '', accounts: [], createdAt: '', updatedAt: '' }

/** The games the user played, from their side; games they didn't play (or two-player local ones) are left out. */
export function playerGames(
  games: readonly GameSummary[],
  profile: Profile | undefined,
): PlayerGame[] {
  return games.flatMap((game) => {
    const side = sideOf(profile ?? NO_PROFILE, game)
    if (!side) return []
    const own = game[side]
    return [
      {
        game,
        category: categoryOf(game),
        side,
        outcome: outcomeOf(game.result, side),
        ...(own.rating !== undefined && { rating: own.rating }),
        opponent: game[side === 'white' ? 'black' : 'white'],
      },
    ]
  })
}

function outcomeOf(result: GameResult, side: Color): PlayerOutcome {
  if (result === '*') return 'unfinished'
  if (result === '1/2-1/2') return 'draw'
  return (result === '1-0') === (side === 'white') ? 'win' : 'loss'
}

/** Which of the user's games to look at. Every field narrows; none: all of them. */
export interface GameFilter {
  category?: GameCategory
  color?: Color
  outcome?: PlayerOutcome
  /** Part of the opponent's name, any case. */
  opponent?: string
  /** Part of the opening's name (any case), or an ECO code or its start ("B2"). */
  opening?: string
  speed?: GameSpeed
  rated?: boolean
  reviewed?: boolean
  /** Dates (YYYY-MM-DD, UTC), both included. */
  since?: string
  until?: string
}

export function filterGames(games: readonly PlayerGame[], filter: GameFilter): PlayerGame[] {
  const opponent = filter.opponent?.toLowerCase()
  const opening = filter.opening?.toLowerCase()
  return games.filter(({ game, category, side, outcome, opponent: them }) => {
    const day = game.playedAt.slice(0, 10)
    return (
      (filter.category === undefined || category === filter.category) &&
      (filter.color === undefined || side === filter.color) &&
      (filter.outcome === undefined || outcome === filter.outcome) &&
      (opponent === undefined || them.name.toLowerCase().includes(opponent)) &&
      (opening === undefined || matchesOpening(game.opening, opening)) &&
      (filter.speed === undefined || game.speed === filter.speed) &&
      (filter.rated === undefined || game.rated === filter.rated) &&
      (filter.reviewed === undefined || game.reviewed === filter.reviewed) &&
      (filter.since === undefined || day >= filter.since) &&
      (filter.until === undefined || day <= filter.until)
    )
  })
}

function matchesOpening(game: GameSummary['opening'], query: string): boolean {
  if (!game) return false
  if (game.eco?.toLowerCase().startsWith(query)) return true
  return game.name?.toLowerCase().includes(query) ?? false
}
