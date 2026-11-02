import type { BotLevel } from './levels'

export interface BotBudget {
  /** Search budget for this move. */
  nodes: number
  /** Range to wait before moving, so replies don't land instantly. */
  delayMs: { min: number; max: number }
}

const RELAXED = { min: 350, max: 900 }

/**
 * How long the bot may think, given the time it has left (no clock: unlimited). Low on time it
 * skips the pause and searches less, like a player in time trouble.
 */
export function botBudget(level: BotLevel, remainingMs?: number): BotBudget {
  if (remainingMs === undefined || remainingMs > 60_000)
    return { nodes: level.nodes, delayMs: RELAXED }
  if (remainingMs > 20_000) return { nodes: level.nodes, delayMs: { min: 100, max: 300 } }
  if (remainingMs > 5_000)
    return { nodes: Math.min(level.nodes, 50_000), delayMs: { min: 0, max: 0 } }
  return { nodes: Math.min(level.nodes, 10_000), delayMs: { min: 0, max: 0 } }
}
