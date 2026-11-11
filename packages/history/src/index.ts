/** History context: the user's finished games and reviews, kept for the coach and statistics. */
export { gameLine, lineText, type GameLine } from './domain/line'
export {
  filterGames,
  playerGames,
  recentGames,
  type GameFilter,
  type GameSummary,
  type PlayerGame,
  type PlayerOutcome,
} from './domain/playerGames'
export {
  groupGames,
  moveQuality,
  openingFamily,
  phaseOf,
  ratingTrends,
  tally,
  type GamePhase,
  type Group,
  type GroupBy,
  type MoveQuality,
  type RatingTrend,
  type ReviewedMoveRow,
  type Tally,
} from './domain/stats'
export {
  lastBookPly,
  MAX_MOMENTS,
  momentFacts,
  phaseAccuracy,
  tryVerdict,
  walkthroughMoves,
  type MomentFacts,
  type TryVerdict,
} from './domain/walkthrough'
export {
  afterAttempt,
  gamePuzzles,
  puzzleState,
  type Puzzle,
  type PuzzleProgress,
  type PuzzleState,
} from './domain/training'
export {
  endReason,
  gameFacts,
  OPENING_MOVES_KEPT,
  type EndReason,
  type GameFacts,
} from './domain/gameFacts'
export {
  activity,
  endings,
  isTimeZone,
  openingsAs,
  profileStats,
  ratingHistory,
  repertoire,
  repertoireLines,
  REPERTOIRE_PLIES,
  type Activity,
  type DayPart,
  type EndingCount,
  type Endings,
  type OpeningStats,
  type ProfileStats,
  type RatingSeries,
  type RepertoireLine,
  type RepertoireNode,
  type StatsGame,
  type StatsGameRow,
  type Weekday,
} from './domain/profileStats'
export {
  afterOpening,
  OPENING_PLIES,
  openingDetail,
  openingOverview,
  openingPath,
  practiceVerdict,
  theoryChoices,
  theoryMoves,
  type AfterOpening,
  type Departure,
  type Departures,
  type LeftBy,
  type OpeningDetail,
  type OpeningGame,
  type OpeningGameRow,
  type OpeningLine,
  type OpeningMove,
  type OpeningOverview,
  type OpeningPath,
  type PracticeVerdict,
  type TheoryMove,
} from './domain/openings'
export {
  afterReview,
  newLine,
  REVIEW_DAYS,
  reviewDue,
  type ReviewProgress,
} from './domain/repertoire'
export type { GameHistory } from './ports/gameHistory'
export type { ReviewRepository, StoredReview } from './ports/reviewRepository'
export { InMemoryReviewRepository } from './adapters/inMemoryReviewRepository'
export { ensureReview, type EnsureReviewDeps } from './usecases/ensureReview'
export {
  lookupGames,
  LOOKUP_MONTHS,
  type LookupGames,
  type LookupOptions,
} from './usecases/lookupGames'
