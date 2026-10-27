import { useQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { useServices } from '@/app/servicesContext'
import { AnalysisPage } from './AnalysisPage'

/** Remounts the page when the URL points at a different game or position. */
export function AnalysisRoute() {
  const search = useSearch({ from: '/analysis' })
  if (search.game) return <LibraryGameAnalysis id={search.game} />
  return <AnalysisPage key={`${search.fen ?? ''}\n${search.pgn ?? ''}`} initial={search} />
}

function LibraryGameAnalysis({ id }: { id: string }) {
  const { library } = useServices()
  const game = useQuery({
    queryKey: ['games', id],
    queryFn: async () => (await library.games.get(id)) ?? null,
  })
  if (game.isPending) return <p className="page-message">Loading game…</p>
  if (!game.data) {
    return (
      <AnalysisPage key={`missing:${id}`} initial={{ error: 'This game is not in your library' }} />
    )
  }
  return <AnalysisPage key={id} initial={{ pgn: game.data.pgn }} />
}
