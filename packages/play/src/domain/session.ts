import type { Color, GameStatus } from '@chessy/chess'
import type { GameResult } from '@chessy/library'
import type { BotLevel } from './levels'
import type { Random } from './random'

/** What the player picks before a bot game. */
export interface BotGameSetup {
  level: BotLevel
  /** The side the user plays. */
  color: Color
}

export type ColorChoice = Color | 'random'

export function resolveColor(choice: ColorChoice, random: Random): Color {
  if (choice !== 'random') return choice
  return random() < 0.5 ? 'white' : 'black'
}

export function opposite(color: Color): Color {
  return color === 'white' ? 'black' : 'white'
}

/** The PGN result: who resigned, else the final position's status ('*' while it goes on). */
export function resultOf(status: GameStatus, resigned?: Color): GameResult {
  if (resigned) return resigned === 'white' ? '0-1' : '1-0'
  if (status.kind === 'checkmate') return status.winner === 'white' ? '1-0' : '0-1'
  if (status.kind === 'draw') return '1/2-1/2'
  return '*'
}

/** The bot's name as it shows in the PGN and the library. */
export function botName(level: BotLevel): string {
  return `Chessy bot (level ${level.level})`
}
