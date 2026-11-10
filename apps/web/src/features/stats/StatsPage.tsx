import type { PlayerStatsBody } from '@pawnia/contracts'
import { isValidUsername, parseGameUrl, type SourceId } from '@pawnia/library'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactNode } from 'react'
import type { StatsQuery, StatsSpeed } from '@/adapters/api/remoteStats'
import { useServices } from '@/app/servicesContext'
import { PlayerCard } from '@/features/profile/PlayerCard'
import { rememberSearch, recentSearches, type PlayerSearch } from './recentSearches'
import { scouting } from './scouting'
import { Record, StatsView, type GameLink } from './StatsView'
import '@/features/profile/Profile.css'
import './Stats.css'

const WINDOWS = [30, 100, 300] as const
const SPEEDS: { value?: StatsSpeed; label: string }[] = [
  { label: 'All' },
  { value: 'bullet', label: 'Bullet' },
  { value: 'blitz', label: 'Blitz' },
  { value: 'rapid', label: 'Rapid' },
]

const PLATFORMS: Record<SourceId, string> = { chesscom: 'chess.com', lichess: 'lichess' }

/** /stats: numbers over the user's recent games, or anyone's on chess.com or lichess. */
export function StatsPage() {
  const { source, user } = useSearch({ from: '/stats' })
  const lookup = source && user ? { source, username: user } : undefined
  return (
    <div className="stats-page">
      <header className="stats-header">
        <h1>Stats</h1>
        <nav className="stats-modes" aria-label="Whose stats">
          <Link
            to="/stats"
            search={{}}
            activeOptions={{ includeSearch: true }}
            activeProps={{ 'aria-current': 'page' }}
          >
            You
          </Link>
          <LookupForm current={lookup} />
        </nav>
      </header>
      {lookup ? (
        <PlayerStats key={`${lookup.source}:${lookup.username.toLowerCase()}`} {...lookup} />
      ) : (
        <MyStats />
      )}
    </div>
  )
}

function LookupForm({ current }: { current: PlayerSearch | undefined }) {
  const navigate = useNavigate()
  const [source, setSource] = useState<SourceId>(current?.source ?? 'chesscom')
  const [username, setUsername] = useState(current?.username ?? '')
  const valid = isValidUsername(username.trim())
  const recent = recentSearches().filter(
    (s) =>
      !(
        current &&
        s.source === current.source &&
        s.username.toLowerCase() === current.username.toLowerCase()
      ),
  )
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) void navigate({ to: '/stats', search: { source, user: username.trim() } })
  }
  return (
    <form className="stats-lookup" role="search" aria-label="Look up a player" onSubmit={submit}>
      <select
        aria-label="Platform"
        value={source}
        onChange={(e) => setSource(e.target.value as SourceId)}
      >
        <option value="chesscom">chess.com</option>
        <option value="lichess">lichess</option>
      </select>
      <input
        aria-label="Username"
        placeholder="Look up a player"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <button type="submit" disabled={!valid}>
        Look up
      </button>
      {recent.length > 0 && (
        <span className="stats-recent">
          Recent:{' '}
          {recent.map((s, i) => (
            <span key={`${s.source}:${s.username}`}>
              {i > 0 && ' · '}
              <Link
                to="/stats"
                search={{ source: s.source, user: s.username }}
                title={PLATFORMS[s.source]}
              >
                {s.username}
              </Link>
            </span>
          ))}
        </span>
      )}
    </form>
  )
}

/** The window and speed buttons; `defaultLast` is where a fresh view starts. */
function useFilters(defaultLast: number) {
  const [query, setQuery] = useState<StatsQuery>({ last: defaultLast })
  const filters = (
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
  )
  return { query, filters }
}

/** Own games open in the analysis board. */
const ownGame: GameLink = (game, children) => (
  <Link to="/analysis" search={{ game: game.id }}>
    {children}
  </Link>
)

function MyStats() {
  const { stats } = useServices()
  const { query, filters } = useFilters(30)
  const mine = useQuery({
    queryKey: ['stats', 'me', query.last, query.speed ?? 'all'],
    queryFn: () => stats.mine(query),
    placeholderData: keepPreviousData,
    retry: false,
  })
  const data = mine.data
  return (
    <>
      {filters}
      <Loading query={mine} pending="Counting your games…" />
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
            <WindowRecord stats={data} />
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
    </>
  )
}

function PlayerStats({ source, username }: PlayerSearch) {
  const { stats } = useServices()
  const { query, filters } = useFilters(100)
  const player = useQuery({
    queryKey: ['stats', 'player', source, username.toLowerCase(), query.last, query.speed ?? 'all'],
    queryFn: async () => {
      const found = await stats.player(source, username, query)
      if (found.player.kind === 'lookup')
        rememberSearch({ source, username: found.player.profile.username })
      return found
    },
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 5 * 60_000,
  })
  const data = player.data
  const gameLink: GameLink = (game, children) => (
    <LookupGame url={game.url} username={username}>
      {children}
    </LookupGame>
  )
  return (
    <>
      {filters}
      <Loading
        query={player}
        pending={`Reading ${username}'s games on ${PLATFORMS[source]}… (a few seconds for a long history)`}
      />
      {data && data.player.kind === 'lookup' && (
        <div className={player.isPlaceholderData ? 'stats-body stats-stale' : 'stats-body'}>
          <section className="stats-summary" aria-label="Summary">
            <PlayerCard player={data.player.profile} />
            <WindowRecord stats={data} />
          </section>
          {data.window.found === 0 ? (
            <p className="stats-empty">No finished games like these in the last 12 months.</p>
          ) : (
            <>
              <Scouting stats={data} />
              <StatsView stats={data} gameLink={gameLink} />
            </>
          )}
        </div>
      )}
    </>
  )
}

function Loading({
  query,
  pending,
}: {
  query: { isPending: boolean; isError: boolean; error: Error | null }
  pending: string
}) {
  if (query.isPending) return <p className="stats-note">{pending}</p>
  if (query.isError)
    return (
      <p className="message message-error" role="alert">
        {query.error?.message}
      </p>
    )
  return null
}

/** How many games count, and their record. */
function WindowRecord({ stats }: { stats: PlayerStatsBody }) {
  const { found, last, speed, since, more } = stats.window
  const kind = `${speed ? `${speed} ` : ''}${found === 1 ? 'game' : 'games'}`
  let note = ''
  if (found < last && since) {
    note = more
      ? ` (only the newest ${found} were read)`
      : ` (all since ${new Date(since).toLocaleDateString(undefined, { dateStyle: 'medium' })})`
  } else if (found < last) note = ` (of ${last} asked for)`
  return (
    <div className="stats-summary-record">
      <p className="stats-note">
        Last {found} {kind}
        {note}
      </p>
      <Record tally={stats.record} />
    </div>
  )
}

function Scouting({ stats }: { stats: PlayerStatsBody }) {
  const lines = scouting(stats)
  const name = stats.player.kind === 'lookup' ? stats.player.profile.username : 'them'
  return (
    <section className="stats-section stats-scouting" aria-label={`Against ${name}`}>
      <h2>Against {name}</h2>
      {lines.length === 0 ? (
        <p className="stats-note">Nothing stands out in these games.</p>
      ) : (
        <ul>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <p className="stats-note">From the numbers below, not from the coach.</p>
    </section>
  )
}

/**
 * A looked-up game: fetched by its page id and opened on the analysis board from its PGN, without
 * putting it into the user's library.
 */
function LookupGame({
  url,
  username,
  children,
}: {
  url: string | undefined
  username: string
  children: ReactNode
}) {
  const { library } = useServices()
  const navigate = useNavigate()
  const [state, setState] = useState<'idle' | 'opening' | string>('idle')
  const ref = url ? parseGameUrl(url) : undefined
  if (!ref) return <>{children}</>
  const open = async () => {
    setState('opening')
    try {
      const game = await library.sources[ref.source].game(ref.id, { username })
      await navigate({ to: '/analysis', search: { pgn: game.pgn } })
    } catch (error) {
      setState(error instanceof Error ? error.message : String(error))
    }
  }
  return (
    <>
      <button
        type="button"
        className="stats-game-link"
        disabled={state === 'opening'}
        onClick={() => void open()}
      >
        {children}
      </button>
      {state !== 'idle' && state !== 'opening' && (
        <span className="stats-note" role="alert">
          {' '}
          Could not open it: {state}
        </span>
      )}
    </>
  )
}
