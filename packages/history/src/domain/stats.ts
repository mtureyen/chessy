import type { MoveClass } from '@pawnia/analysis'
import type { Color } from '@pawnia/chess'
import type { GameSpeed } from '@pawnia/library'
import type { PlayerGame } from './playerGames'

/** Results of a set of games, from the user's side. */
export interface Tally {
  games: number
  wins: number
  draws: number
  losses: number
  /** Games not finished yet (not in the score). */
  unfinished: number
  /** Points per finished game in percent (a draw is half a point); absent without one. */
  score?: number
}

export function tally(games: readonly PlayerGame[]): Tally {
  const count = (outcome: PlayerGame['outcome']) =>
    games.filter((g) => g.outcome === outcome).length
  const [wins, draws, losses] = [count('win'), count('draw'), count('loss')]
  const finished = wins + draws + losses
  return {
    games: games.length,
    wins,
    draws,
    losses,
    unfinished: games.length - finished,
    ...(finished > 0 && { score: Math.round(((wins + draws / 2) / finished) * 100) }),
  }
}

export type GroupBy = 'opening' | 'color' | 'speed' | 'category' | 'month' | 'opponent_strength'

export interface Group {
  key: string
  tally: Tally
}

/** How strong opponents were next to the user, in rating points. */
const STRENGTH_GAP = 100

/**
 * The games split into groups, each with its results. Openings by family, the most played
 * first; months in order; opponents as stronger / similar / weaker (games with both ratings).
 */
export function groupGames(games: readonly PlayerGame[], by: GroupBy): Group[] {
  const groups = new Map<string, PlayerGame[]>()
  for (const game of games) {
    const key = groupKey(game, by)
    if (key === undefined) continue
    groups.set(key, [...(groups.get(key) ?? []), game])
  }
  const result = [...groups].map(([key, members]) => ({ key, tally: tally(members) }))
  if (by === 'month') return result.sort((a, b) => a.key.localeCompare(b.key))
  if (by === 'opponent_strength') {
    return STRENGTH_ORDER.flatMap((key) => result.filter((g) => g.key === key))
  }
  return result.sort((a, b) => b.tally.games - a.tally.games || a.key.localeCompare(b.key))
}

const STRENGTH_ORDER = [
  `stronger (+${STRENGTH_GAP} or more)`,
  `similar (within ${STRENGTH_GAP})`,
  `weaker (-${STRENGTH_GAP} or more)`,
]

function groupKey({ game, side, category, rating, opponent }: PlayerGame, by: GroupBy) {
  switch (by) {
    case 'opening':
      return game.opening?.name && game.opening.name !== NO_OPENING
        ? openingFamily(game.opening.name)
        : 'unknown opening'
    case 'color':
      return side
    case 'speed':
      return game.speed
    case 'category':
      return category
    case 'month':
      return game.playedAt.slice(0, 7)
    case 'opponent_strength': {
      if (rating === undefined || opponent.rating === undefined) return undefined
      const gap = opponent.rating - rating
      return STRENGTH_ORDER[gap >= STRENGTH_GAP ? 0 : gap <= -STRENGTH_GAP ? 2 : 1]
    }
  }
}

/** Not an opening: what games imported from chess.com earlier may have as the name of none. */
const NO_OPENING = 'Undefined'

/** Words that end an opening's family name in chess.com's names ("Sicilian Defense Alapin Variation"). */
const FAMILY_ENDS = new Set(['opening', 'game', 'defense', 'defence', 'attack', 'gambit', 'system'])

/**
 * The opening's family: lichess names it before the colon ("Sicilian Defense: Alapin
 * Variation"); in chess.com's names it ends with a word like Defense or Gambit.
 */
export function openingFamily(name: string): string {
  const colon = name.indexOf(':')
  if (colon > 0) return name.slice(0, colon).trim()
  const words = name.split(/\s+/)
  const end = words.findIndex((word) => FAMILY_ENDS.has(word.toLowerCase()))
  return end >= 0 ? words.slice(0, end + 1).join(' ') : name
}

/** The user's rating on one platform and speed over the games looked at. */
export interface RatingTrend {
  category: PlayerGame['category']
  speed: GameSpeed
  games: number
  first: RatingAt
  last: RatingAt
  highest: RatingAt
  lowest: RatingAt
}

export interface RatingAt {
  rating: number
  /** YYYY-MM-DD. */
  date: string
}

/** Per platform and speed, the user's rating at the first and last game, and its extremes. */
export function ratingTrends(games: readonly PlayerGame[]): RatingTrend[] {
  const series = new Map<string, PlayerGame[]>()
  for (const game of games) {
    if (game.rating === undefined || !game.game.rated) continue
    const key = `${game.category} ${game.game.speed}`
    series.set(key, [...(series.get(key) ?? []), game])
  }
  return [...series.values()]
    .map((members) => {
      const ordered = [...members].sort((a, b) => a.game.playedAt.localeCompare(b.game.playedAt))
      const at = (g: PlayerGame): RatingAt => ({
        rating: g.rating!,
        date: g.game.playedAt.slice(0, 10),
      })
      const byRating = [...ordered].sort((a, b) => a.rating! - b.rating!)
      return {
        category: ordered[0]!.category,
        speed: ordered[0]!.game.speed,
        games: ordered.length,
        first: at(ordered[0]!),
        last: at(ordered.at(-1)!),
        highest: at(byRating.at(-1)!),
        lowest: at(byRating[0]!),
      }
    })
    .sort((a, b) => b.games - a.games)
}

/** A reviewed move, with what it takes to tell the game's phase. */
export interface ReviewedMoveRow {
  gameId: string
  /** 1-based half-move number. */
  ply: number
  color: Color
  classification: MoveClass
  /** Queens, rooks, bishops and knights on the board before the move (both sides), if known. */
  pieces?: number
}

export type GamePhase = 'opening' | 'middlegame' | 'endgame'

/** Endgame: at most this many queens, rooks, bishops and knights left (lichess's rule). */
const ENDGAME_PIECES = 6
/** The opening: the first ten moves of each side, unless it is an endgame already. */
const OPENING_PLIES = 20

export function phaseOf(ply: number, pieces: number | undefined): GamePhase {
  if (pieces !== undefined && pieces <= ENDGAME_PIECES) return 'endgame'
  return ply <= OPENING_PLIES ? 'opening' : 'middlegame'
}

/** Errors counted per phase: the classes that cost something. */
const ERRORS = ['inaccuracy', 'mistake', 'miss', 'blunder'] as const satisfies MoveClass[]
type ErrorClass = (typeof ERRORS)[number]

export interface PhaseQuality {
  /** The user's moves in this phase. */
  moves: number
  errors: Record<ErrorClass, number>
}

export interface MoveQuality {
  /** How many of the games have a review (only these count below). */
  reviewedGames: number
  /** The user's mean accuracy over those games. */
  averageAccuracy?: number
  phases: Record<GamePhase, PhaseQuality>
  /** Errors per reviewed game, all phases. */
  errorsPerGame: Record<ErrorClass, number>
}

/** How well the user played in the reviewed games among these: accuracy, errors by phase. */
export function moveQuality(
  games: readonly PlayerGame[],
  moves: readonly ReviewedMoveRow[],
): MoveQuality {
  const reviewed = new Map(games.filter((g) => g.game.reviewed).map((g) => [g.game.id, g]))
  const empty = (): PhaseQuality => ({
    moves: 0,
    errors: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
  })
  const phases: Record<GamePhase, PhaseQuality> = {
    opening: empty(),
    middlegame: empty(),
    endgame: empty(),
  }
  for (const move of moves) {
    const game = reviewed.get(move.gameId)
    if (!game || move.color !== game.side) continue
    const phase = phases[phaseOf(move.ply, move.pieces)]
    phase.moves++
    if ((ERRORS as readonly MoveClass[]).includes(move.classification)) {
      phase.errors[move.classification as ErrorClass]++
    }
  }
  const accuracies = [...reviewed.values()].flatMap((g) => {
    const accuracy = g.game.accuracy?.[g.side]
    return accuracy === undefined ? [] : [accuracy]
  })
  const perGame = (error: ErrorClass) => {
    const total = Object.values(phases).reduce((sum, phase) => sum + phase.errors[error], 0)
    return reviewed.size > 0 ? Math.round((total / reviewed.size) * 10) / 10 : 0
  }
  return {
    reviewedGames: reviewed.size,
    ...(accuracies.length > 0 && {
      averageAccuracy: Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length),
    }),
    phases,
    errorsPerGame: {
      inaccuracy: perGame('inaccuracy'),
      mistake: perGame('mistake'),
      miss: perGame('miss'),
      blunder: perGame('blunder'),
    },
  }
}
