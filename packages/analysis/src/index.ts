import type {} from './env'
/** Analysis context: engine port, UCI protocol, evaluations. */
export type { AnalysisEnd, AnalysisRequest, AnalysisSnapshot, EngineLine } from './domain/analysis'
export { formatSanLine, toSanLine, type LineMove } from './domain/line'
export {
  compareScores,
  formatScore,
  toWhitePov,
  whiteWinChance,
  winningChances,
  type RelativeScore,
  type Score,
} from './domain/score'
export {
  goCommand,
  parseBestMove,
  parseInfo,
  type SearchLimits,
  type UciBestMove,
  type UciInfo,
} from './domain/uci'
export type { AnalysisHandle, EngineInfo, EngineProvider } from './ports/engine'
export type { UciTransport } from './ports/uciTransport'
export { UciEngine, type UciEngineOptions } from './adapters/uciEngine'
export { gameAccuracy, moveAccuracy } from './domain/review/accuracy'
export {
  bookKey,
  buildBookData,
  createOpeningBook,
  type BookData,
  type Opening,
  type OpeningBook,
} from './domain/review/book'
export {
  CLASSIFY_CONFIG,
  MOVE_CLASSES,
  classifyMove,
  expectedPointsLost,
  type MoveClass,
  type MoveFacts,
} from './domain/review/classify'
export { evalCacheKey, positionKey } from './domain/review/keys'
export {
  keyMoments,
  type GameReview,
  type PositionEval,
  type ReviewedMove,
  type ReviewedPosition,
} from './domain/review/types'
export { CP_CEILING, cappedCentipawns, winPercent } from './domain/review/winPercent'
export type { EvalCache } from './ports/evalCache'
export { InMemoryEvalCache } from './adapters/inMemoryEvalCache'
export {
  ReviewCancelledError,
  ReviewEngineError,
  describeBest,
  reviewGame,
  type CancelSignal,
  type ReviewDeps,
  type ReviewInput,
  type ReviewOptions,
} from './usecases/reviewGame'
