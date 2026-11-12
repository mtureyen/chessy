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
  type ClassifyConfig,
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
export type { HumanMoveModel, HumanMoveQuery } from './ports/humanMoveModel'
export { InMemoryEvalCache } from './adapters/inMemoryEvalCache'
export {
  EngineFailedError,
  EvaluationCancelledError,
  type CancelSignal,
  type EvaluateOptions,
  type EvaluationRequest,
  type EvaluatorInfo,
  type PositionEvaluator,
} from './ports/evaluator'
export { EnginePoolEvaluator } from './adapters/enginePoolEvaluator'
export {
  describeBest,
  reviewGame,
  type ReviewDeps,
  type ReviewInput,
  type ReviewOptions,
} from './usecases/reviewGame'
export {
  bandOf,
  bandsTotal,
  bandTotal,
  BANDS,
  entryLines,
  LIBRARY_PLIES,
  LibraryCounter,
  libraryKeys,
  libraryTree,
  lineKeys,
  LOW_BANDS,
  moveStats,
  moveTotal,
  openingNumbers,
  openingTags,
  positionMoves,
  sanMoves,
  scoreFor,
  TRAP_LOSS,
  trapCandidates,
  trapInOpening,
  type Band,
  type BandCounts,
  type BookLine,
  type LibraryFile,
  type LibraryNode,
  type OpeningNumbers,
  type OpeningTags,
  type PositionCounts,
  type TrapCandidate,
} from './domain/library/library'
export {
  capPuzzles,
  formatPuzzleSet,
  isGoodPuzzle,
  packPuzzle,
  parsePuzzleRow,
  PICK_DISTANCES,
  pickPuzzle,
  PUZZLE_CAP,
  PUZZLE_COLUMNS,
  PUZZLE_FILTER,
  puzzleStart,
  puzzleThemeKind,
  puzzleThemes,
  unpackPuzzle,
  type PackedPuzzle,
  type PickedPuzzle,
  type Puzzle,
  type PuzzleCap,
  type PuzzleFilter,
  type PuzzleRow,
  type PuzzleSetFile,
  type PuzzleSetSource,
  type PuzzleStart,
  type PuzzleThemeCount,
  type PuzzleThemeKind,
  type PuzzleWish,
} from './domain/puzzleSet/puzzleSet'
export {
  START_SET,
  type LibraryEntry,
  type LibraryGroup,
  type OpeningStyle,
} from './domain/library/startSet'
export { allThemes } from './domain/tactics/tagThemes'
export type { TacticLine } from './domain/tactics/puzzle'
export { THEMES, type Theme } from './domain/tactics/themes'
