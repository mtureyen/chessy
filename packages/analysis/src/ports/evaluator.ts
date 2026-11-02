import type { PositionEval } from '../domain/review/types'

/** The part of AbortSignal we use; browsers, Bun and Node signals all fit. */
export interface CancelSignal {
  readonly aborted: boolean
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void
  removeEventListener(type: 'abort', listener: () => void): void
}

export interface EvaluationRequest {
  fens: readonly string[]
  /** Node budget per position. */
  nodes: number
  multiPv: number
}

export interface EvaluateOptions {
  signal?: CancelSignal
  /** Called as each position finishes (in any order). */
  onEvaluated?: (index: number, value: PositionEval) => void
}

export interface EvaluatorInfo {
  /** Engine name incl. version; part of the eval cache key. */
  name: string
  /** How many positions are evaluated at the same time. */
  parallelism: number
}

/**
 * Port: evaluates many positions (a whole game) with a fixed node budget. Each position is
 * searched from an empty hash, so results do not depend on order or on which engine ran them.
 * Adapters: a local engine (browser WASM), a pool of native engines (server), the API (browser).
 */
export interface PositionEvaluator {
  describe(): Promise<EvaluatorInfo>
  /** Results in the order of `fens`. Throws EvaluationCancelledError or EngineFailedError. */
  evaluate(request: EvaluationRequest, options?: EvaluateOptions): Promise<PositionEval[]>
}

export class EvaluationCancelledError extends Error {
  constructor() {
    super('Evaluation cancelled')
    this.name = 'EvaluationCancelledError'
  }
}

export class EngineFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EngineFailedError'
  }
}
