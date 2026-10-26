import type { Score } from './score'
import type { SearchLimits } from './uci'

export interface AnalysisRequest extends SearchLimits {
  fen: string
  /** Number of best lines to compute (UCI MultiPV). Defaults to 1. */
  multiPv?: number
}

/** One candidate line, best first (`rank` 1). */
export interface EngineLine {
  rank: number
  depth: number
  score: Score
  /** Principal variation in UCI notation, e.g. ["e2e4", "e7e5"]. */
  pv: string[]
}

export type AnalysisEnd =
  /** Reached the requested depth/time/nodes. */
  | 'limit'
  /** Stopped via `stop()` or `dispose()`. */
  | 'stopped'
  /** Replaced by a newer analysis before it finished (or before it started). */
  | 'superseded'
  /** The engine failed to load or crashed; see `error`. */
  | 'error'

export interface AnalysisSnapshot {
  fen: string
  /** Depth of the best line; 0 before the first result. */
  depth: number
  lines: EngineLine[]
  nodes?: number
  nps?: number
  timeMs?: number
  /** Set once the search has ended. */
  end?: AnalysisEnd
  /** Final best move (UCI), present when the search ended with one. */
  bestMove?: string
  error?: string
}
