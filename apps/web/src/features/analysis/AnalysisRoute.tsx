import { useSearch } from '@tanstack/react-router'
import { AnalysisPage } from './AnalysisPage'

/** Remounts the page when the URL points at a different game or position. */
export function AnalysisRoute() {
  const search = useSearch({ from: '/analysis' })
  return <AnalysisPage key={`${search.fen ?? ''}\n${search.pgn ?? ''}`} initial={search} />
}
