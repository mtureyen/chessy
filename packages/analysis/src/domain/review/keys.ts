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

/** Cache key for a stored evaluation. Includes everything that changes the engine's answer. */
export function evalCacheKey({ engine, nodes, multiPv, fen }: EvalCacheKeyParts): string {
  return `${engine}|n${nodes}|pv${multiPv}|${positionKey(fen)}`
}
