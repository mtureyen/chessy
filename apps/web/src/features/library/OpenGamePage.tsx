import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useServices } from '@/app/servicesContext'
import './OpenGamePage.css'

/**
 * /open?url=<game page>: brings a lichess or chess.com game into the library and shows it on the
 * analysis board. The "Open in pawnia" browser extension links here.
 */
export function OpenGamePage() {
  const { url } = useSearch({ from: '/open' })
  const { library } = useServices()
  const navigate = useNavigate()
  const opened = useQuery({
    queryKey: ['open', url],
    queryFn: () => library.openGame(url ?? ''),
    enabled: !!url,
    retry: false,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (opened.data)
      void navigate({ to: '/analysis', search: { game: opened.data.id }, replace: true })
  }, [opened.data, navigate])

  if (!url) return <OpenFailed message="No game link given." />
  if (opened.isError) return <OpenFailed message={opened.error.message} />
  return <p className="open-game">Opening the game…</p>
}

function OpenFailed({ message }: { message: string }) {
  return (
    <div className="open-game open-game-failed" role="alert">
      <p>Could not open this game: {message}</p>
      <Link to="/games">Go to your games</Link>
    </div>
  )
}
