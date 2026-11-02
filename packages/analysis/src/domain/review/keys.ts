/** Board, side to move, castling and en passant: what makes two positions "the same". */
export function positionKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ')
}

export interface EvalCacheKeyParts {
  /** Engine name incl. version, e.g. "Stockfish 19 Lite WASM". */
  engine: string
  nodes: number
  multiPv: number
  fen: string
}

/** Version of how evaluations are computed; bump it when that changes (v2: fresh hash per search). */
const EVAL_VERSION = 'v2'

/** Cache key for a stored evaluation. Includes everything that changes the engine's answer. */
export function evalCacheKey({ engine, nodes, multiPv, fen }: EvalCacheKeyParts): string {
  return `${EVAL_VERSION}|${engine}|n${nodes}|pv${multiPv}|${positionKey(fen)}`
}
