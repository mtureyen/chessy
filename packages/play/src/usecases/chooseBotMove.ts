import { EngineFailedError, type CancelSignal, type EngineProvider } from '@pawnia/analysis'
import { createGame, type Color } from '@pawnia/chess'
import { botBudget } from '../domain/budget'
import type { BotLevel } from '../domain/levels'
import type { Random } from '../domain/random'
import { sampleHumanMove } from '../domain/humanSelection'
import { selectMove, type BotChoice } from '../domain/selection'
import type { HumanMovePolicy } from '../ports/humanMovePolicy'

export interface BotMoveDeps {
  /** The bot's own engine: a search for another purpose on it would cancel the bot's. */
  engine: EngineProvider
  /** For human-like levels; without it (or when it fails) they play from the engine. */
  human?: HumanMovePolicy
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
 * The bot's move: for a human-like level what a human of its rating would play, otherwise (or if
 * the human-move model fails) one of the engine's best moves for the level.
 * Throws BotMoveCancelledError, EngineFailedError, or InvalidPositionError for a bad FEN, and
 * an Error when the position has no legal move.
 */
export async function chooseBotMove(
  deps: BotMoveDeps,
  request: BotMoveRequest,
): Promise<BotChoice> {
  const position = createGame(request.fen)
  if (position.status().kind !== 'ongoing') throw new Error('The game is over: no move to play')
  if (request.signal?.aborted) throw new BotMoveCancelledError()

  const { human } = request.level
  if (human && deps.human) {
    try {
      const prediction = await deps.human.predict({
        fen: request.fen,
        eloSelf: human.elo,
        eloOppo: human.elo,
      })
      if (request.signal?.aborted) throw new BotMoveCancelledError()
      const move = sampleHumanMove(prediction.moves, human, request.random)
      if (move) {
        return { move, by: 'human', winChance: prediction.expectedScore * 100, candidates: [] }
      }
    } catch (error) {
      if (error instanceof BotMoveCancelledError) throw error
      // Model unreachable or failing: the engine plays this move instead.
    }
  }
  return engineMove(deps.engine, position.turn(), request)
}

/** Lets the engine rank the position's moves for the level, then picks one of them. */
async function engineMove(
  engine: EngineProvider,
  turn: Color,
  { fen, level, random, remainingMs, signal }: BotMoveRequest,
): Promise<BotChoice> {
  // Fresh searches with a node limit: the same seed replays the same game.
  const { nodes } = botBudget(level, remainingMs)
  const handle = engine.analyze({ fen, nodes, multiPv: level.candidates, fresh: true })
  const stop = () => handle.stop()
  signal?.addEventListener('abort', stop, { once: true })
  const snapshot = await handle.result.finally(() => signal?.removeEventListener('abort', stop))

  if (snapshot.end === 'error') throw new EngineFailedError(snapshot.error ?? 'Engine failed')
  if (snapshot.end !== 'limit' || signal?.aborted) throw new BotMoveCancelledError()
  const choice = selectMove(snapshot.lines, turn, level, random)
  if (choice) return choice
  if (snapshot.bestMove) return { move: snapshot.bestMove, by: 'engine', candidates: [] }
  throw new EngineFailedError('The engine returned no move')
}
