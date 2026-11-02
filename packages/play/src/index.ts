/** Play context: games against bots, from choosing a move to saving the finished game. */
export { BOT_LEVELS, botLevel, type BotLevel } from './domain/levels'
export { pickWeighted, seededRandom, type Random } from './domain/random'
export { selectMove, type BotChoice, type Candidate } from './domain/selection'
export {
  botName,
  opposite,
  resolveColor,
  resultOf,
  type BotGameSetup,
  type ColorChoice,
} from './domain/session'
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
