import type { PositionEval } from '../domain/review/types'

/** Port: stored evaluations, keyed by evalCacheKey (position + engine + nodes + multi-PV). */
export interface EvalCache {
  get(key: string): Promise<PositionEval | undefined>
  put(key: string, value: PositionEval): Promise<void>
}
