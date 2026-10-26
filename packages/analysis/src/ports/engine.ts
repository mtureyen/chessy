import type { AnalysisRequest, AnalysisSnapshot } from '../domain/analysis'

export interface EngineInfo {
  name: string
}

export interface AnalysisHandle {
  /** Ends the search early; `result` then resolves with end = 'stopped'. */
  stop(): void
  /** Resolves when the search ends, for any reason. Never rejects (failures end with 'error'). */
  readonly result: Promise<AnalysisSnapshot>
}

/** Port: a chess engine that analyses positions. Browser (WASM) and server (native) adapters implement it. */
export interface EngineProvider {
  /** Loads the engine. Idempotent; `analyze` calls it implicitly. */
  init(): Promise<EngineInfo>
  /**
   * Starts analysing a position. A running analysis is stopped first and ends with 'superseded'.
   * `onUpdate` receives every improvement and the final snapshot (not for superseded searches).
   * Throws InvalidPositionError for an invalid FEN.
   */
  analyze(request: AnalysisRequest, onUpdate?: (snapshot: AnalysisSnapshot) => void): AnalysisHandle
  dispose(): void
}
