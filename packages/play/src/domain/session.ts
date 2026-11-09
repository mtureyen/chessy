import { hasInsufficientMaterial, type Color, type GameStatus } from '@pawnia/chess'
import type { GameResult } from '@pawnia/library'
import type { TimeControl } from './clock'
import type { BotLevel } from './levels'
import type { Random } from './random'

/** What the player picks before a bot game. */
export interface BotGameSetup {
  level: BotLevel
  /** The side the user plays. */
  color: Color
  /** Unset: no clock. */
  timeControl?: TimeControl
}

export type ColorChoice = Color | 'random'

/** How a game ended other than on the board (mate, stalemate and other draws come from the status). */
export type Termination =
  | { reason: 'resignation'; loser: Color }
  /** `draw`: the opponent of the side out of time could not have mated anyway. */
  | { reason: 'timeout'; loser: Color; draw: boolean }
  | { reason: 'agreement' }

export function resolveColor(choice: ColorChoice, random: Random): Color {
  if (choice !== 'random') return choice
  return random() < 0.5 ? 'white' : 'black'
}

export function opposite(color: Color): Color {
  return color === 'white' ? 'black' : 'white'
}

/** `loser` ran out of time in `fen`: a loss, or a draw if the opponent cannot mate. */
export function timeout(fen: string, loser: Color): Termination {
  return { reason: 'timeout', loser, draw: hasInsufficientMaterial(fen, opposite(loser)) }
}

/** The PGN result: how the game was ended, else the final position ('*' while it goes on). */
export function resultOf(status: GameStatus, termination?: Termination): GameResult {
  if (termination) {
    if (termination.reason === 'agreement') return '1/2-1/2'
    if (termination.reason === 'timeout' && termination.draw) return '1/2-1/2'
    return termination.loser === 'white' ? '0-1' : '1-0'
  }
  if (status.kind === 'checkmate') return status.winner === 'white' ? '1-0' : '0-1'
  if (status.kind === 'draw') return '1/2-1/2'
  return '*'
}

/**
 * Whether the bot takes a draw offer: when it stands worse, or when a long game is about even.
 * `botWinChance` is its winning chance in percent from its last search.
 */
export function acceptsDraw(botWinChance: number | undefined, ply: number): boolean {
  if (botWinChance === undefined) return false
  return botWinChance < 40 || (ply >= 60 && botWinChance <= 55)
}

/** The bot's name as it shows in the PGN and the library. */
export function botName(level: BotLevel): string {
  return `pawnia bot (level ${level.level})`
}
