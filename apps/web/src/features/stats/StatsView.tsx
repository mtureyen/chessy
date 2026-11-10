import type { PlayerStatsBody } from '@pawnia/contracts'
import { openingFamily } from '@pawnia/history'
import type { ReactNode } from 'react'
import { LineChart, ShareBar, WdlBar } from './charts'
import {
  DAY_PART_LABELS,
  END_LABELS,
  lastMove,
  lineText,
  percent,
  recordText,
  repertoireTree,
  scoreText,
  seriesName,
  strengthLabel,
  WEEKDAY_LABELS,
  type RepertoireTree,
  type Tally,
} from './format'

type Stats = PlayerStatsBody
type GameRow = Stats['games'][number]
type Color = 'white' | 'black'

/** How a game in the lists opens: a link into the analysis board, for example. */
export type GameLink = (game: GameRow, children: ReactNode) => ReactNode

/** Every section of the stats page for one set of games, whoever's they are. */
export function StatsView({ stats, gameLink }: { stats: Stats; gameLink: GameLink }) {
  return (
    <div className="stats-sections">
      <Ratings stats={stats} />
      <Section title="Openings">
        <div className="stats-columns">
          <Openings stats={stats} color="white" gameLink={gameLink} />
          <Openings stats={stats} color="black" gameLink={gameLink} />
        </div>
      </Section>
      <Section
        title="Repertoire"
        note="The first moves, three deep; moves played once are left out."
      >
        <div className="stats-columns">
          <Repertoire stats={stats} color="white" />
          <Repertoire stats={stats} color="black" />
        </div>
      </Section>
      <Endings stats={stats} />
      <Section title="Against opponents">
        <TallyRows
          rows={stats.opponents.map((g) => ({ label: strengthLabel(g.key), tally: g.tally }))}
        />
      </Section>
      <Section title="When" note={`Times in ${stats.activity.timeZone}.`}>
        <div className="stats-columns">
          <TallyRows
            rows={stats.activity.dayParts.map((p) => ({
              label: DAY_PART_LABELS[p.key],
              tally: p.tally,
            }))}
          />
          <TallyRows
            rows={stats.activity.weekdays.map((d) => ({
              label: WEEKDAY_LABELS[d.key],
              tally: d.tally,
            }))}
          />
        </div>
      </Section>
      {stats.quality && <Quality quality={stats.quality} />}
      <Games games={stats.games} gameLink={gameLink} />
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="stats-section" aria-label={title}>
      <h2>{title}</h2>
      {note && <p className="stats-note">{note}</p>}
      {children}
    </section>
  )
}

/** The record of a set of games in one line: score, W-D-L and the bar. */
export function Record({ tally }: { tally: Tally }) {
  return (
    <span className="stats-record">
      <span className="stats-score">{scoreText(tally)}</span>
      <WdlBar tally={tally} />
      <span className="stats-wdl" title="wins-draws-losses">
        {recordText(tally)}
      </span>
    </span>
  )
}

function TallyRows({ rows }: { rows: { label: string; tally: Tally }[] }) {
  if (rows.length === 0) return <p className="stats-note">No games.</p>
  return (
    <table className="stats-table">
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col" className="stats-number">
            Games
          </th>
          <th scope="col">Score · W-D-L</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td className="stats-number">{row.tally.games}</td>
            <td>
              <Record tally={row.tally} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Ratings({ stats }: { stats: Stats }) {
  const series = stats.ratings.filter((s) => s.points.length > 0).slice(0, 3)
  if (series.length === 0) return null
  return (
    <Section title="Rating">
      <div className="stats-columns">
        {series.map((s) => {
          const first = s.points[0]!.rating
          const last = s.points.at(-1)!.rating
          const change = last - first
          const name = seriesName(s.category, s.speed)
          return (
            <div key={name} className="stats-rating">
              <h3>
                {name} <span className="stats-rating-now">{last}</span>{' '}
                <span className="stats-note">
                  {change === 0 ? '±0' : change > 0 ? `+${change}` : `−${-change}`} over{' '}
                  {s.points.length} {s.points.length === 1 ? 'game' : 'games'}
                </span>
              </h3>
              <LineChart
                label={`${name} rating`}
                points={s.points.map((p) => ({ at: p.at, value: p.rating }))}
              />
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function Openings({ stats, color, gameLink }: { stats: Stats; color: Color; gameLink: GameLink }) {
  const openings = stats.openings[color]
  const games = openings.reduce((sum, o) => sum + o.tally.games, 0)
  return (
    <div className="stats-openings">
      <h3>
        As {color === 'white' ? 'White' : 'Black'}{' '}
        <span className="stats-note">
          {games} {games === 1 ? 'game' : 'games'}
        </span>
      </h3>
      {openings.length === 0 && <p className="stats-note">No games.</p>}
      {openings.map((opening) => {
        const names = new Set(opening.variations.map((v) => v.name))
        const played = stats.games.filter(
          (g) =>
            g.side === color &&
            (g.opening ? names.has(g.opening) : opening.family === 'Unknown opening'),
        )
        return (
          <details key={opening.family} className="stats-opening">
            <summary>
              <span className="stats-opening-name">{opening.family}</span>
              <span className="stats-number">{opening.tally.games}</span>
              <Record tally={opening.tally} />
            </summary>
            {(opening.variations.length > 1 || opening.variations[0]?.name !== opening.family) && (
              <ul className="stats-variations">
                {opening.variations.map((v) => (
                  <li key={v.name}>
                    <span>{variationName(v.name, opening.family)}</span>
                    <span className="stats-number">{v.tally.games}</span>
                    <span className="stats-wdl">{recordText(v.tally)}</span>
                  </li>
                ))}
              </ul>
            )}
            <GameList games={played} gameLink={gameLink} />
          </details>
        )
      })}
    </div>
  )
}

/** The name without the family in front, where it starts with it. */
function variationName(name: string, family: string): string {
  if (openingFamily(name) !== family || name === family) return name
  return name.slice(family.length).replace(/^[\s:,]+/, '') || name
}

function Repertoire({ stats, color }: { stats: Stats; color: Color }) {
  const tree = repertoireTree(stats.repertoire[color])
  const total = tree.reduce((sum, node) => sum + node.line.tally.games, 0)
  return (
    <div className="stats-repertoire">
      <h3>{color === 'white' ? 'As White' : 'As Black'}</h3>
      {tree.length === 0 ? (
        <p className="stats-note">Not enough games.</p>
      ) : (
        <ul className="stats-tree" role="tree" aria-label={`Repertoire as ${color}`}>
          {tree.map((node) => (
            <TreeNode key={node.line.moves.join(' ')} node={node} parentGames={total} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TreeNode({
  node,
  parentGames,
  parentOpening,
}: {
  node: RepertoireTree
  parentGames: number
  parentOpening?: string
}) {
  const { line, children } = node
  const row = (
    <>
      <span className="stats-move" title={lineText(line.moves)}>
        {lastMove(line.moves)}
      </span>
      <span className="stats-number">{line.tally.games}</span>
      <span className="stats-share">{percent(line.tally.games, parentGames)}%</span>
      <Record tally={line.tally} />
      {line.opening && line.opening !== parentOpening && (
        <span className="stats-tree-opening">{line.opening}</span>
      )}
    </>
  )
  return (
    <li role="treeitem" aria-selected={false}>
      {children.length === 0 ? (
        <div className="stats-tree-row stats-tree-leaf">{row}</div>
      ) : (
        <details open={line.moves.length < 2}>
          <summary className="stats-tree-row">{row}</summary>
          <ul role="group">
            {children.map((child) => (
              <TreeNode
                key={child.line.moves.join(' ')}
                node={child}
                parentGames={line.tally.games}
                {...(line.opening && { parentOpening: line.opening })}
              />
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}

function Endings({ stats }: { stats: Stats }) {
  const { wins, draws, losses, averageMoves } = stats.endings
  const column = (title: string, counts: typeof wins, tone: 'win' | 'loss') => {
    const total = counts.reduce((sum, c) => sum + c.games, 0)
    return (
      <div>
        <h3>
          {title} <span className="stats-note">{total}</span>
        </h3>
        {counts.length === 0 ? (
          <p className="stats-note">None.</p>
        ) : (
          <ul className="stats-bars">
            {counts.map((c) => (
              <li key={c.reason}>
                <span>{END_LABELS[c.reason]}</span>
                <ShareBar share={percent(c.games, total)} tone={tone} />
                <span className="stats-number">{c.games}</span>
                <span className="stats-share">{percent(c.games, total)}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  const drawTotal = draws.reduce((sum, c) => sum + c.games, 0)
  return (
    <Section title="How games end">
      <div className="stats-columns">
        {column('Wins', wins, 'win')}
        {column('Losses', losses, 'loss')}
      </div>
      <p className="stats-note">
        {drawTotal > 0
          ? `Draws ${drawTotal}: ${draws.map((c) => `${c.games} ${END_LABELS[c.reason].toLowerCase()}`).join(' · ')}.`
          : 'No draws.'}
        {averageMoves !== undefined && ` Games last ${averageMoves} moves on average.`}
      </p>
    </Section>
  )
}

function Quality({ quality }: { quality: NonNullable<Stats['quality']> }) {
  const { reviewedGames, phases, averageAccuracy, accuracy } = quality
  const perGame = (n: number) => (Math.round((n / reviewedGames) * 10) / 10).toFixed(1)
  const kinds = ['blunder', 'mistake', 'miss', 'inaccuracy'] as const
  const names = {
    blunder: 'Blunders',
    mistake: 'Mistakes',
    miss: 'Misses',
    inaccuracy: 'Inaccuracies',
  }
  return (
    <Section
      title="Move quality"
      note={`From the ${reviewedGames} reviewed ${reviewedGames === 1 ? 'game' : 'games'} among these${averageAccuracy !== undefined ? `; average accuracy ${averageAccuracy}` : ''}.`}
    >
      <div className="stats-columns">
        <table className="stats-table">
          <thead>
            <tr>
              <th scope="col">Per game</th>
              <th scope="col" className="stats-number">
                Opening
              </th>
              <th scope="col" className="stats-number">
                Middlegame
              </th>
              <th scope="col" className="stats-number">
                Endgame
              </th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((kind) => (
              <tr key={kind}>
                <th scope="row">{names[kind]}</th>
                <td className="stats-number">{perGame(phases.opening.errors[kind])}</td>
                <td className="stats-number">{perGame(phases.middlegame.errors[kind])}</td>
                <td className="stats-number">{perGame(phases.endgame.errors[kind])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {accuracy.length > 1 && (
          <div className="stats-rating">
            <h3>Accuracy per game</h3>
            <LineChart
              label="Accuracy"
              points={accuracy.map((a) => ({ at: a.at, value: a.accuracy }))}
              format={(v) => v.toFixed(0)}
            />
          </div>
        )}
      </div>
    </Section>
  )
}

const dayText = (at: string) => new Date(at).toLocaleDateString(undefined, { dateStyle: 'medium' })

const OUTCOME = { win: 'Won', loss: 'Lost', draw: 'Draw', unfinished: '–' }

function GameList({ games, gameLink }: { games: GameRow[]; gameLink: GameLink }) {
  if (games.length === 0) return null
  return (
    <ul className="stats-games">
      {games.slice(0, 10).map((game) => (
        <li key={game.id}>
          {gameLink(
            game,
            <>
              <span className={`stats-outcome stats-outcome-${game.outcome}`}>
                {OUTCOME[game.outcome]}
              </span>{' '}
              vs {game.opponent.name}
              {game.opponent.rating !== undefined && ` (${game.opponent.rating})`}
              <span className="stats-note"> · {dayText(game.playedAt)}</span>
            </>,
          )}
        </li>
      ))}
      {games.length > 10 && <li className="stats-note">and {games.length - 10} more</li>}
    </ul>
  )
}

function Games({ games, gameLink }: { games: GameRow[]; gameLink: GameLink }) {
  if (games.length === 0) return null
  return (
    <details className="stats-section stats-all-games">
      <summary>
        <h2>All {games.length} games</h2>
      </summary>
      <div className="stats-scroll">
        <table className="stats-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Result</th>
              <th scope="col">Opponent</th>
              <th scope="col">Opening</th>
              <th scope="col">Ended</th>
              <th scope="col">Moves</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.id}>
                <td>{gameLink(game, dayText(game.playedAt))}</td>
                <td>
                  <span className={`player-dot player-dot-${game.side}`} aria-label={game.side} />{' '}
                  {OUTCOME[game.outcome]}
                </td>
                <td>
                  {game.opponent.name}
                  {game.opponent.rating !== undefined && ` (${game.opponent.rating})`}
                </td>
                <td>{game.opening ?? '–'}</td>
                <td>{game.end ? END_LABELS[game.end] : '–'}</td>
                <td className="stats-number">{game.moves ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
