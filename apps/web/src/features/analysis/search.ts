/** URL search params of /analysis: a library game (`game`), a whole PGN (`pgn`) or a position (`fen`). */
export interface AnalysisSearch {
  game?: string
  fen?: string
  pgn?: string
  /** Start a review of the opened game right away (e.g. straight after a bot game). */
  review?: boolean
  /** Open with the coach's tab in front, to ask about the position. */
  coach?: boolean
}

export function parseAnalysisSearch(search: Record<string, unknown>): AnalysisSearch {
  const result: AnalysisSearch = {}
  for (const key of ['game', 'fen', 'pgn'] as const) {
    const value = search[key]
    if (typeof value === 'string' && value.trim()) result[key] = value
  }
  if (search.review === true || search.review === 'true' || search.review === '1')
    result.review = true
  if (search.coach === true || search.coach === 'true' || search.coach === '1') result.coach = true
  return result
}
