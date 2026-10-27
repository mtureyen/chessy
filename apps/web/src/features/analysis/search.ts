/** URL search params of /analysis: a library game (`game`), a whole PGN (`pgn`) or a position (`fen`). */
export interface AnalysisSearch {
  game?: string
  fen?: string
  pgn?: string
}

export function parseAnalysisSearch(search: Record<string, unknown>): AnalysisSearch {
  const result: AnalysisSearch = {}
  for (const key of ['game', 'fen', 'pgn'] as const) {
    const value = search[key]
    if (typeof value === 'string' && value.trim()) result[key] = value
  }
  return result
}
