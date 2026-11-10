import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { StatsQuery, StatsSpeed } from '@/adapters/api/remoteStats'
import { useServices } from '@/app/servicesContext'
import { Record, StatsView, type GameLink } from './StatsView'
import './Stats.css'

const WINDOWS = [30, 100, 300] as const
const SPEEDS: { value?: StatsSpeed; label: string }[] = [
  { label: 'All' },
  { value: 'bullet', label: 'Bullet' },
  { value: 'blitz', label: 'Blitz' },
  { value: 'rapid', label: 'Rapid' },
]

const PLATFORMS = { chesscom: 'chess.com', lichess: 'lichess' }

/** Own games open in the analysis board. */
const ownGame: GameLink = (game, children) => (
  <Link to="/analysis" search={{ game: game.id }}>
    {children}
  </Link>
)

/** /stats: numbers over the user's recent games. */
export function StatsPage() {
  const { stats } = useServices()
  const [query, setQuery] = useState<StatsQuery>({ last: 30 })
  const mine = useQuery({
    queryKey: ['stats', 'me', query.last, query.speed ?? 'all'],
    queryFn: () => stats.mine(query),
    placeholderData: keepPreviousData,
    retry: false,
  })
  const data = mine.data

  return (
    <div className="stats-page">
      <header className="stats-header">
        <h1>Stats</h1>
        <div className="stats-filters">
          <fieldset>
            <legend>Last</legend>
            {WINDOWS.map((last) => (
              <button
                key={last}
                type="button"
                aria-pressed={query.last === last}
                onClick={() => setQuery((q) => ({ ...q, last }))}
              >
                {last}
              </button>
            ))}
          </fieldset>
          <fieldset>
            <legend>Speed</legend>
            {SPEEDS.map((speed) => (
              <button
                key={speed.label}
                type="button"
                aria-pressed={query.speed === speed.value}
                onClick={() =>
                  setQuery(({ last }) => ({ last, ...(speed.value && { speed: speed.value }) }))
                }
              >
                {speed.label}
              </button>
            ))}
          </fieldset>
        </div>
      </header>

      {mine.isPending && <p className="stats-note">Counting your games…</p>}
      {mine.isError && (
        <p className="message message-error" role="alert">
          {mine.error.message}
        </p>
      )}
      {data && data.player.kind === 'me' && (
        <div className={mine.isPlaceholderData ? 'stats-body stats-stale' : 'stats-body'}>
          <section className="stats-summary" aria-label="Summary">
            <div>
              <h2>{data.player.displayName}</h2>
              <p className="stats-note">
                {data.player.accounts.length > 0
                  ? data.player.accounts
                      .map((a) => `${a.username} on ${PLATFORMS[a.source]}`)
                      .join(' · ')
                  : 'No accounts linked.'}
              </p>
            </div>
            <div className="stats-summary-record">
              <p className="stats-note">
                Last {data.window.found}
                {data.window.speed ? ` ${data.window.speed}` : ''}{' '}
                {data.window.found === 1 ? 'game' : 'games'}
                {data.window.found < data.window.last && ` (of ${data.window.last} asked for)`}
              </p>
              <Record tally={data.record} />
            </div>
          </section>
          {data.window.found === 0 ? (
            <p className="stats-empty">
              {data.player.accounts.length === 0 ? (
                <>
                  No games to count yet.{' '}
                  <Link to="/profile">Link your chess.com or lichess account</Link> and import your
                  games.
                </>
              ) : (
                'No finished games like these yet.'
              )}
            </p>
          ) : (
            <StatsView stats={data} gameLink={ownGame} />
          )}
        </div>
      )}
    </div>
  )
}
