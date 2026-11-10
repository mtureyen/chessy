import type { OpeningBody, OpeningsBody } from '@pawnia/contracts'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import type { OpeningsQuery, OpeningsSpeed } from '@/adapters/api/remoteOpenings'
import { useServices } from '@/app/servicesContext'
import {
  lastMove,
  lineText,
  percent,
  repertoireTree,
  type RepertoireTree,
} from '@/features/stats/format'
import { Record } from '@/features/stats/StatsView'
import { TrainingTabs } from '../TrainingTabs'
import { departureText, moveText, openingLabel, theoryText } from './format'
import '@/features/stats/Stats.css'
import '../Training.css'
import './Openings.css'

const WINDOWS = [100, 300] as const
const SPEEDS: { value?: OpeningsSpeed; label: string }[] = [
  { label: 'All' },
  { value: 'bullet', label: 'Bullet' },
  { value: 'blitz', label: 'Blitz' },
  { value: 'rapid', label: 'Rapid' },
]

type Color = 'white' | 'black'
type Line = OpeningBody['lines'][number]

/** /training/openings: the user's openings, worst first; with ?color&family one of them. */
export function OpeningsPage() {
  const { color, family } = useSearch({ from: '/training/openings' })
  const [query, setQuery] = useState<OpeningsQuery>({ last: 300 })
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
  return (
    <div className="stats-page openings-page">
      <TrainingTabs />
      {filters}
      {color && family ? (
        <OneOpening color={color} family={family} query={query} />
      ) : (
        <Overview query={query} />
      )}
    </div>
  )
}

function Overview({ query }: { query: OpeningsQuery }) {
  const { training } = useServices()
  const list = useQuery({
    queryKey: ['openings', query.last, query.speed ?? 'all'],
    queryFn: () => training.openings(query),
    placeholderData: keepPreviousData,
    retry: false,
  })
  if (list.isPending) return <p className="stats-note">Going through your openings…</p>
  if (list.isError)
    return (
      <p className="message message-error" role="alert">
        {list.error.message}
      </p>
    )
  const { window, openings } = list.data
  const of = (color: Color) => openings.filter((o) => o.color === color)
  return (
    <div className={list.isPlaceholderData ? 'stats-body stats-stale' : 'stats-body'}>
      <p className="stats-note">
        From your last {window.found} {window.speed ? `${window.speed} ` : ''}games on chess.com and
        lichess, worst first. Openings you played once are left out.
      </p>
      {openings.length === 0 ? (
        <p className="stats-empty">
          No openings to show yet. <Link to="/profile">Link your chess.com or lichess account</Link>{' '}
          and import your games.
        </p>
      ) : (
        <div className="stats-columns">
          <OpeningList color="white" openings={of('white')} />
          <OpeningList color="black" openings={of('black')} />
        </div>
      )}
    </div>
  )
}

function OpeningList({ color, openings }: { color: Color; openings: OpeningsBody['openings'] }) {
  return (
    <section className="stats-section" aria-label={`Openings as ${color}`}>
      <h2>As {color === 'white' ? 'White' : 'Black'}</h2>
      {openings.length === 0 && <p className="stats-note">None with two games or more.</p>}
      <ul className="openings-list">
        {openings.map((o) => (
          <li key={o.family}>
            <Link to="/training/openings" search={{ color, family: o.family }}>
              <span className="openings-name">{openingLabel(o.family, color)}</span>
              <span className="stats-number">{o.tally.games}</span>
              <Record tally={o.tally} />
              <span className="openings-departure">{departureText(o.departures)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function OneOpening({
  color,
  family,
  query,
}: {
  color: Color
  family: string
  query: OpeningsQuery
}) {
  const { training } = useServices()
  const one = useQuery({
    queryKey: ['openings', color, family, query.last, query.speed ?? 'all'],
    queryFn: () => training.opening(color, family, query),
    placeholderData: keepPreviousData,
    retry: false,
  })
  const back = (
    <Link to="/training/openings" search={{}} className="openings-back">
      ← All openings
    </Link>
  )
  if (one.isPending) return <p className="stats-note">Going through your games…</p>
  if (one.isError)
    return (
      <>
        {back}
        <p className="message message-error" role="alert">
          {one.error.message}
        </p>
      </>
    )
  const opening = one.data
  const { after } = opening
  const tree = repertoireTree(opening.lines)
  return (
    <div className={one.isPlaceholderData ? 'stats-body stats-stale' : 'stats-body'}>
      {back}
      <section className="stats-summary" aria-label="Summary">
        <div>
          <h1 className="openings-title">
            {openingLabel(family, color)}{' '}
            <span className="stats-note">as {color === 'white' ? 'White' : 'Black'}</span>
          </h1>
          <p className="stats-note">{departureText(opening.departures)}.</p>
        </div>
        <div className="stats-summary-record">
          <p className="stats-note">
            {opening.tally.games} of your last {opening.window.found} games
          </p>
          <Record tally={opening.tally} />
        </div>
      </section>

      <section className="stats-section" aria-label="Your lines">
        <h2>Your lines</h2>
        <p className="stats-note">
          Moves you played twice or more, and the way to each point where a game left theory.
        </p>
        <ul className="stats-tree openings-tree" role="tree" aria-label={`Lines of the ${family}`}>
          {tree.map((node) => (
            <LineNode
              key={node.line.moves.join(' ')}
              node={node}
              parentGames={opening.tally.games}
            />
          ))}
        </ul>
      </section>

      <section className="stats-section" aria-label="After the opening">
        <h2>After the opening</h2>
        {after.reviewedGames === 0 ? (
          <p className="stats-note">
            None of these games is reviewed yet. <Link to="/profile">Review your recent games</Link>{' '}
            to see how you come out of the opening.
          </p>
        ) : (
          <p>
            From {after.reviewedGames} reviewed {after.reviewedGames === 1 ? 'game' : 'games'}:
            {after.win !== undefined && (
              <>
                {' '}
                after move 12 your winning chance is <strong>{after.win}%</strong> on average;
              </>
            )}{' '}
            <strong>{after.errorsPerGame.toFixed(1)}</strong> inaccuracies or worse per game in the
            first 10 moves.
            {after.reviewedGames < opening.tally.games && (
              <>
                {' '}
                <Link to="/profile">Review more games</Link> for a clearer picture.
              </>
            )}
          </p>
        )}
      </section>

      <section className="stats-section" aria-label="Games">
        <h2>Games</h2>
        <GameRows games={opening.games.slice(0, SHOWN_GAMES)} />
        {opening.games.length > SHOWN_GAMES && (
          <details className="openings-more">
            <summary>Show all {opening.games.length} games</summary>
            <GameRows games={opening.games.slice(SHOWN_GAMES)} />
          </details>
        )}
      </section>
    </div>
  )
}

/** The games listed before "Show all". */
const SHOWN_GAMES = 15

function GameRows({ games }: { games: OpeningBody['games'] }) {
  return (
    <ul className="stats-games openings-games">
      {games.map((game) => (
        <li key={game.id}>
          <Link to="/analysis" search={{ game: game.id }}>
            <span className={`stats-outcome stats-outcome-${game.outcome}`}>
              {OUTCOME[game.outcome]}
            </span>{' '}
            vs {game.opponent.name}
            {game.opponent.rating !== undefined && ` (${game.opponent.rating})`}
          </Link>
          <span className="stats-note">
            {' '}
            · {new Date(game.playedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
            {game.left &&
              ` · ${game.left.by === 'you' ? 'you' : 'they'} left theory with ${moveText(game.left.ply, game.left.san)}`}
          </span>
        </li>
      ))}
    </ul>
  )
}

const OUTCOME = { win: 'Won', loss: 'Lost', draw: 'Draw', unfinished: '–' }

function LineNode({ node, parentGames }: { node: RepertoireTree<Line>; parentGames: number }) {
  const { line, children } = node
  const left = !line.book && line.theory !== undefined
  const row = (
    <>
      <span className="stats-move" title={lineText(line.moves)}>
        {lastMove(line.moves)}
      </span>
      <span className="stats-number">{line.tally.games}</span>
      <span className="stats-share">{percent(line.tally.games, parentGames)}%</span>
      <Record tally={line.tally} />
      {left ? (
        <span className={`openings-left openings-left-${line.yours ? 'you' : 'them'}`}>
          {line.yours ? 'You left theory' : 'They left theory'}
          {line.theory!.length > 0 && `: theory has ${theoryText(line.moves, line.theory!)}`}
        </span>
      ) : (
        !line.book && <span className="stats-tree-opening">past theory</span>
      )}
    </>
  )
  return (
    <li role="treeitem" aria-selected={false}>
      {children.length === 0 ? (
        <div className="stats-tree-row stats-tree-leaf">{row}</div>
      ) : (
        <details open={line.moves.length < 4 || (line.book && line.moves.length < 6)}>
          <summary className="stats-tree-row">{row}</summary>
          <ul role="group">
            {children.map((child) => (
              <LineNode
                key={child.line.moves.join(' ')}
                node={child}
                parentGames={line.tally.games}
              />
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}
