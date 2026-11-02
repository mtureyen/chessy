/** Play context: games against bots, from choosing a move to saving the finished game. */
export { botBudget, type BotBudget } from './domain/budget'
export {
  createClock,
  flagged,
  pressClock,
  remainingMs,
  stopClock,
  type ClockState,
  type TimeControl,
} from './domain/clock'
export { BOT_LEVELS, botLevel, type BotLevel } from './domain/levels'
export { pickWeighted, seededRandom, type Random } from './domain/random'
export { selectMove, type BotChoice, type Candidate } from './domain/selection'
export {
  acceptsDraw,
  botName,
  opposite,
  resolveColor,
  resultOf,
  timeout,
  type BotGameSetup,
  type ColorChoice,
  type Termination,
} from './domain/session'
export {
  pgnTimeControl,
  speedOf,
  TIME_CONTROLS,
  type TimeControlPreset,
} from './domain/timeControl'
export {
  BotMoveCancelledError,
  chooseBotMove,
  type BotMoveDeps,
  type BotMoveRequest,
} from './usecases/chooseBotMove'
export {
  recordBotGame,
  type FinishedBotGame,
  type RecordBotGameDeps,
} from './usecases/recordBotGame'
