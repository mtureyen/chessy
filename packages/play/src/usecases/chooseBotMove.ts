import { EngineFailedError, type CancelSignal, type EngineProvider } from '@chessy/analysis'
import { createGame } from '@chessy/chess'
import { botBudget } from '../domain/budget'
import type { BotLevel } from '../domain/levels'
import type { Random } from '../domain/random'
import { selectMove, type BotChoice } from '../domain/selection'

export interface BotMoveDeps {
  /** The bot's own engine: a search for another purpose on it would cancel the bot's. */
  engine: EngineProvider
}

export interface BotMoveRequest {
  fen: string
  level: BotLevel
  random: Random
  /** The bot's time left; it searches less when low. Unset: no clock. */
  remainingMs?: number
  signal?: CancelSignal
}

/** The bot's search was cancelled (signal, or another search took over the engine). */
export class BotMoveCancelledError extends Error {
  constructor() {
    super('The bot stopped thinking')
    this.name = 'BotMoveCancelledError'
  }
}

/**
 * Lets the engine rank the position's moves for the level, then picks one of them.
 * Throws BotMoveCancelledError, EngineFailedError, or InvalidPositionError for a bad FEN, and
 * an Error when the position has no legal move.
 */
export async function chooseBotMove(
  { engine }: BotMoveDeps,
  { fen, level, random, remainingMs, signal }: BotMoveRequest,
): Promise<BotChoice> {
  const position = createGame(fen)
  if (position.status().kind !== 'ongoing') throw new Error('The game is over: no move to play')
  if (signal?.aborted) throw new BotMoveCancelledError()

  // Fresh searches with a node limit: the same seed replays the same game.
  const { nodes } = botBudget(level, remainingMs)
  const handle = engine.analyze({ fen, nodes, multiPv: level.candidates, fresh: true })
  const stop = () => handle.stop()
  signal?.addEventListener('abort', stop, { once: true })
  const snapshot = await handle.result.finally(() => signal?.removeEventListener('abort', stop))

  if (snapshot.end === 'error') throw new EngineFailedError(snapshot.error ?? 'Engine failed')
  if (snapshot.end !== 'limit' || signal?.aborted) throw new BotMoveCancelledError()
  const choice = selectMove(snapshot.lines, position.turn(), level, random)
  if (choice) return choice
  if (snapshot.bestMove) return { move: snapshot.bestMove, candidates: [] }
  throw new EngineFailedError('The engine returned no move')
}
