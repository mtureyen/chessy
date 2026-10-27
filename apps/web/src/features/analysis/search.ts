/** URL search params of /analysis: a position (`fen`) or a whole game (`pgn`) to open. */
export interface AnalysisSearch {
  fen?: string
  pgn?: string
}

export function parseAnalysisSearch(search: Record<string, unknown>): AnalysisSearch {
  const result: AnalysisSearch = {}
  if (typeof search.fen === 'string' && search.fen.trim()) result.fen = search.fen
  if (typeof search.pgn === 'string' && search.pgn.trim()) result.pgn = search.pgn
  return result
}
