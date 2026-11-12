import type { LibraryOpeningBody, OpeningLibraryBody } from '@pawnia/contracts'
import { createGame } from '@pawnia/chess'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearch } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { lineText } from '@/features/stats/format'
import { Board } from '@/shared/board/Board'
import { TrainingTabs } from '../TrainingTabs'
import { arrowsWanted, explorerArrows, openingPaths, rememberArrows } from './arrows'
import { Guide } from './Guide'
import { guideNotes } from './learnLine'
import { LineTrainer } from './LineTrainer'
import {
  BAND_LABELS,
  BANDS,
  games,
  gamesText,
  GROUP_LABELS,
  percents,
  results,
  scoreOf,
  STYLE_LABELS,
  trapText,
  type BandChoice,
  type BandStats,
  type Results,
} from './format'
import '@/features/stats/Stats.css'
import '../Training.css'
import './Library.css'

type Summary = OpeningLibraryBody['openings'][number]

/** /training/library: openings to study for White and Black; with ?id one of them. */
export function LibraryPage() {
  const { id } = useSearch({ from: '/training/library' })
  return (
    <div className="stats-page library-page">
      <TrainingTabs />
      {id ? <OneOpening id={id} /> : <Overview />}
    </div>
  )
}

function Overview() {
  const { openingLibrary } = useServices()
  const [side, setSide] = useState<'white' | 'black'>('white')
  const list = useQuery({ queryKey: ['opening-library'], queryFn: () => openingLibrary.list() })
  if (list.isPending) return <p className="stats-note">Opening the library…</p>
  if (list.isError)
    return (
      <p className="message message-error" role="alert">
        {list.error.message}
      </p>
    )
  const groups = side === 'white' ? (['white'] as const) : (['vs-e4', 'vs-d4'] as const)
  const games = Object.values(list.data.games).reduce((a, b) => a + b, 0)
  return (
    <>
      <div className="library-intro">
        <h1>Opening library</h1>
        <p className="stats-note">
          Openings to study, with their lines, how they do in {(games / 1_000_000).toFixed(1)}{' '}
          million real lichess games at every level, and the traps that catch players under 1600.
        </p>
        <div className="stats-filters library-side">
          <fieldset>
            <legend>I want to study openings for</legend>
            {(['white', 'black'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)}>
                {s === 'white' ? 'White' : 'Black'}
              </button>
            ))}
          </fieldset>
        </div>
      </div>
      {groups.map((group) => (
        <section key={group} className="stats-section" aria-label={GROUP_LABELS[group]}>
          <h2>{GROUP_LABELS[group]}</h2>
          <ul className="library-cards">
            {list.data.openings
              .filter((o) => o.group === group)
              .map((opening) => (
                <li key={opening.id}>
                  <OpeningCard opening={opening} />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  )
}

function Chips({ opening }: { opening: Pick<Summary, 'style' | 'tags'> & { traps?: number } }) {
  return (
    <span className="library-chips">
      {opening.style.map((s) => (
        <span key={s} className="library-chip">
          {STYLE_LABELS[s]}
        </span>
      ))}
      {opening.tags.lowElo && (
        <span className="library-chip library-chip-low">Works at low–mid Elo</span>
      )}
      {opening.tags.strong && (
        <span className="library-chip library-chip-strong">Strong players' choice</span>
      )}
      {opening.traps !== undefined && opening.traps > 0 && (
        <span className="library-chip library-chip-trap">
          {opening.traps} {opening.traps === 1 ? 'trap' : 'traps'}
        </span>
      )}
    </span>
  )
}

function OpeningCard({ opening }: { opening: Summary }) {
  const { score } = opening.numbers
  const low = score['1200-1599']
  const high = score['2000+']
  return (
    <Link to="/training/library" search={{ id: opening.id }} className="library-card">
      <span className="library-card-name">{opening.name}</span>
      <span className="library-card-line">{lineText(opening.main.split(' '))}</span>
      <Chips opening={opening} />
      <span className="stats-note">
        {opening.side === 'white' ? 'White' : 'Black'} scores
        {low !== undefined && ` ${low}% at 1200–1599`}
        {high !== undefined && ` · ${high}% at 2000+`} · {opening.lines} named lines
      </span>
    </Link>
  )
}

/** One opening: the board, what is played where, the named lines, the traps. */
function OneOpening({ id }: { id: string }) {
  const { openingLibrary } = useServices()
  const one = useQuery({
    queryKey: ['opening-library', id],
    queryFn: () => openingLibrary.opening(id),
  })
  const back = (
    <Link to="/training/library" search={{}} className="openings-back">
      ← All openings
    </Link>
  )
  if (one.isPending) return <p className="stats-note">Opening the library…</p>
  if (one.isError)
    return (
      <>
        {back}
        <p className="message message-error" role="alert">
          {one.error.message}
        </p>
      </>
    )
  return (
    <>
      {back}
      <OpeningView opening={one.data} />
    </>
  )
}

function OpeningView({ opening }: { opening: LibraryOpeningBody }) {
  const { openingLibrary, repertoire } = useServices()
  const main = opening.main.split(' ')
  const [path, setPath] = useState<string[]>(main)
  const [band, setBand] = useState<BandChoice>('all')
  const [learning, setLearning] = useState<string[]>()
  /** The move pointed at in the list of what's played, with the position it belongs to. */
  const [pointed, setPointed] = useState<{ at: string; san: string }>()
  const paths = useMemo(() => openingPaths(opening.tree), [opening.tree])
  // The same query as the guide's section: its notes go with the moves they are about.
  const guide = useQuery({
    queryKey: ['opening-library', opening.id, 'guide'],
    queryFn: () => openingLibrary.guide(opening.id),
  })
  /** A line's name: the named line it is, or the opening and its moves. */
  const titleOf = (line: string[]) =>
    opening.tree.find((n) => n.name && n.moves.join(' ') === line.join(' '))?.name ??
    `${opening.name}, ${lineText(line)}`
  const keep = (line: string[]) =>
    repertoire.add({ side: opening.side, title: titleOf(line), moves: line, openingId: opening.id })
  if (learning) {
    return (
      <LineTrainer
        line={learning}
        side={opening.side}
        title={titleOf(learning)}
        onAdd={() => keep(learning)}
        notes={guideNotes(learning, guide.data?.moves ?? [])}
        onExit={() => {
          setPath(learning)
          setLearning(undefined)
        }}
      />
    )
  }
  return (
    <>
      <section className="stats-summary" aria-label="Summary">
        <div>
          <h1 className="openings-title">
            {opening.name}{' '}
            <span className="stats-note">for {opening.side === 'white' ? 'White' : 'Black'}</span>
          </h1>
          <p className="library-card-line">{lineText(main)}</p>
          <Chips opening={{ ...opening, traps: opening.traps.length }} />
        </div>
        <ScoreTable opening={opening} />
      </section>

      <div className="layout library-layout">
        <section className="board-column">
          <ExplorerBoard
            path={path}
            side={opening.side}
            band={band}
            paths={paths}
            {...(pointed?.at === path.join(' ') && { pointedAt: pointed.san })}
            onPath={setPath}
            onLearn={() => setLearning(path)}
            onKeep={() => keep(path)}
          />
        </section>
        <aside className="panel library-panel" aria-label="What is played here">
          <Explorer
            path={path}
            side={opening.side}
            band={band}
            onBand={setBand}
            onPath={setPath}
            onPoint={(san) => setPointed(san ? { at: path.join(' '), san } : undefined)}
          />
        </aside>
      </div>

      <Guide opening={opening} path={path} onPath={setPath} onLearn={(line) => setLearning(line)} />

      {opening.traps.length > 0 && (
        <section className="stats-section" aria-label="Traps">
          <h2>Traps</h2>
          <p className="stats-note">
            Found in real games: where most players under 1600 make the same move and lose for it,
            and the engine agrees it's a mistake.
          </p>
          <ul className="library-traps">
            {opening.traps.map((trap) => (
              <li key={`${trap.moves} ${trap.bait}`} className="library-trap">
                <span
                  className={`library-chip ${trap.yours ? 'library-chip-low' : 'library-chip-trap'}`}
                >
                  {trap.yours ? 'A trap you can set' : 'A trap to avoid'}
                </span>
                <p>{trapText(trap)}</p>
                <p className="stats-note">
                  {trap.best && `Better is ${trap.best}. `}
                  After {trap.bait}: {trap.punish}
                </p>
                <button
                  type="button"
                  onClick={() => setPath(trap.moves ? trap.moves.split(' ') : [])}
                >
                  Show on the board
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <NamedLines opening={opening} band={band} path={path} onPath={setPath} />
    </>
  )
}

/** The named lines shown before "Show all". */
const SHOWN_LINES = 15

/** The variations theory names, the most played first; the rarest behind "Show all". */
function NamedLines({
  opening,
  band,
  path,
  onPath,
}: {
  opening: LibraryOpeningBody
  band: BandChoice
  path: string[]
  onPath: (path: string[]) => void
}) {
  const [all, setAll] = useState(false)
  const named = opening.tree
    .filter((node) => node.name)
    .map((node) => ({ node, r: results(node.stats as BandStats, band) }))
    .filter(({ r }) => games(r) > 0)
    .sort((a, b) => games(b.r) - games(a.r))
  const shown = all ? named : named.slice(0, SHOWN_LINES)
  const here = path.join(' ')
  return (
    <section className="stats-section" aria-label="Named lines">
      <h2>Named lines</h2>
      <p className="stats-note">
        The variations theory knows by name, the most played first. Games and{' '}
        {opening.side === 'white' ? 'White' : 'Black'}'s score: {BAND_LABELS[band]}.
      </p>
      <ul className="library-lines">
        {shown.map(({ node, r }) => {
          const score = scoreOf(r, opening.side)
          return (
            <li key={node.moves.join(' ')}>
              <button
                type="button"
                className="library-line"
                aria-current={here === node.moves.join(' ') ? 'true' : undefined}
                onClick={() => onPath(node.moves)}
              >
                <span className="library-line-name">{shortName(node.name!, opening.name)}</span>
                <span className="library-card-line">{lineText(node.moves)}</span>
                <span className="stats-number">{gamesText(games(r))}</span>
                <span className="stats-number">{score === undefined ? '–' : `${score}%`}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {named.length > SHOWN_LINES && (
        <button type="button" className="library-more" onClick={() => setAll((a) => !a)}>
          {all ? 'Show the most played only' : `Show all ${named.length} lines`}
        </button>
      )}
    </section>
  )
}

/** The variation's name without the family in front ("Caro-Kann Defense: Advance" → "Advance"). */
function shortName(name: string, family: string): string {
  if (name === family) return 'Main line'
  const rest = name.startsWith(family) ? name.slice(family.length).replace(/^[:,]\s*/, '') : name
  return rest || name
}

function ScoreTable({ opening }: { opening: LibraryOpeningBody }) {
  return (
    <table className="stats-table library-scores">
      <caption className="stats-note">
        {opening.side === 'white' ? 'White' : 'Black'}'s score, and how often it's played
      </caption>
      <thead>
        <tr>
          <th scope="col">Rating</th>
          <th scope="col" className="stats-number">
            Score
          </th>
          <th scope="col" className="stats-number">
            Played in
          </th>
        </tr>
      </thead>
      <tbody>
        {BANDS.map((band) => (
          <tr key={band}>
            <th scope="row">{BAND_LABELS[band]}</th>
            <td className="stats-number">
              {opening.numbers.score[band] === undefined ? '–' : `${opening.numbers.score[band]}%`}
            </td>
            <td className="stats-number">{perMille(opening.numbers.share[band])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** "1 in 8 games" from per mille. */
function perMille(share: number | undefined): string {
  if (!share) return '–'
  const every = Math.round(1000 / share)
  return every <= 1 ? 'most games' : `1 in ${every} games`
}

/** The board at the explored position; any legal move explores on from there. */
function ExplorerBoard({
  path,
  side,
  band,
  paths,
  pointedAt,
  onPath,
  onLearn,
  onKeep,
}: {
  path: string[]
  side: 'white' | 'black'
  band: BandChoice
  /** Every way into the opening's named lines: arrows that stay in them are green. */
  paths: ReadonlySet<string>
  /** The move pointed at in the list next to the board. */
  pointedAt?: string
  onPath: (path: string[]) => void
  onLearn: () => void
  /** Keeps the line on the board in the repertoire. */
  onKeep: () => Promise<unknown>
}) {
  const [kept, setKept] = useState<{ path: string; text: string }>()
  const game = useMemo(() => {
    const g = createGame()
    for (const san of path) g.play(san)
    return g
  }, [path])
  const last = game.current.move
  const { openingLibrary } = useServices()
  const [arrowsOn, setArrowsOn] = useState(arrowsWanted)
  // The same query as the list next to the board.
  const position = useQuery({
    queryKey: ['opening-library', 'position', path.join(',')],
    queryFn: () => openingLibrary.position(path),
  })
  const drawing = useMemo(() => {
    if (!arrowsOn || !position.data) return undefined
    const played = position.data.moves.map((m) => ({
      san: m.san,
      games: games(results(m.stats as BandStats, band)),
    }))
    return explorerArrows(
      game.fen(),
      played,
      (san) => paths.has([...path, san].join(' ')),
      pointedAt,
    )
  }, [arrowsOn, position.data, band, game, paths, path, pointedAt])
  return (
    <>
      <Board
        fen={game.fen()}
        orientation={side}
        turnColor={game.turn()}
        dests={game.dests()}
        {...(last && { lastMove: [last.from, last.to] as [typeof last.from, typeof last.to] })}
        check={game.isCheck()}
        isPromotion={(from, to) => game.isPromotion(from, to)}
        onMove={(move) => {
          const node = createGame(game.fen()).play(move)
          if (node?.move) onPath([...path, node.move.san])
        }}
        {...(drawing && { drawing })}
      />
      <div className="library-nav">
        <button type="button" onClick={() => onPath([])} disabled={path.length === 0}>
          ⏮ Start
        </button>
        <button
          type="button"
          onClick={() => onPath(path.slice(0, -1))}
          disabled={path.length === 0}
        >
          ◀ Back
        </button>
        <span className="library-card-line">
          {path.length > 0 ? lineText(path) : 'Start position'}
        </span>
        <button
          type="button"
          className="library-learn"
          onClick={onLearn}
          disabled={path.length < 2}
          title="Watch the moves on the board, then play them from memory"
        >
          Learn this line
        </button>
        <button
          type="button"
          onClick={() => {
            const at = path.join(' ')
            onKeep().then(
              () => setKept({ path: at, text: 'In your repertoire' }),
              (error: unknown) =>
                setKept({ path: at, text: error instanceof Error ? error.message : String(error) }),
            )
          }}
          disabled={path.length < 2 || kept?.path === path.join(' ')}
        >
          Add to my repertoire
        </button>
        {kept?.path === path.join(' ') && (
          <span className="stats-note" role="status">
            {kept.text}
          </span>
        )}
      </div>
      <p className="stats-note library-arrows">
        <button
          type="button"
          aria-pressed={arrowsOn}
          onClick={() => {
            rememberArrows(!arrowsOn)
            setArrowsOn(!arrowsOn)
          }}
        >
          Arrows
        </button>
        {arrowsOn &&
          'What is played here: the thicker, the more often. Green stays in this opening’s lines, grey leaves them.'}
      </p>
    </>
  )
}

/** What real games played in the explored position, for one band or all. */
function Explorer({
  path,
  side,
  band,
  onBand,
  onPath,
  onPoint,
}: {
  path: string[]
  side: 'white' | 'black'
  band: BandChoice
  onBand: (band: BandChoice) => void
  onPath: (path: string[]) => void
  /** Tells which move the pointer or the focus is on, so the board can show it. */
  onPoint: (san: string | undefined) => void
}) {
  const { openingLibrary } = useServices()
  const position = useQuery({
    queryKey: ['opening-library', 'position', path.join(',')],
    queryFn: () => openingLibrary.position(path),
  })
  const moves = (position.data?.moves ?? []).map((m) => ({
    ...m,
    r: results(m.stats as BandStats, band),
  }))
  const total = moves.reduce((sum, m) => sum + games(m.r), 0)
  return (
    <div className="training-text">
      <h2>What's played here</h2>
      <div className="stats-filters library-bands">
        <fieldset>
          <legend>Rating</legend>
          {(['all', ...BANDS] as const).map((b) => (
            <button key={b} type="button" aria-pressed={band === b} onClick={() => onBand(b)}>
              {BAND_LABELS[b]}
            </button>
          ))}
        </fieldset>
      </div>
      {position.isPending ? (
        <p className="stats-note">Looking it up…</p>
      ) : moves.length === 0 || total === 0 ? (
        <p className="stats-note">
          The library has no games from here: past its lines, or too rare at this rating.
        </p>
      ) : (
        <table className="stats-table library-moves">
          <thead>
            <tr>
              <th scope="col">Move</th>
              <th scope="col" className="stats-number">
                Games
              </th>
              <th scope="col">White · draw · Black</th>
            </tr>
          </thead>
          <tbody>
            {moves
              .filter((m) => games(m.r) > 0)
              .map((m) => (
                <tr
                  key={m.san}
                  onMouseEnter={() => onPoint(m.san)}
                  onMouseLeave={() => onPoint(undefined)}
                >
                  <th scope="row">
                    <button
                      type="button"
                      className="library-move"
                      onFocus={() => onPoint(m.san)}
                      onBlur={() => onPoint(undefined)}
                      onClick={() => onPath([...path, m.san])}
                    >
                      {m.san}
                    </button>
                  </th>
                  <td className="stats-number">
                    {gamesText(games(m.r))}{' '}
                    <span className="stats-share">{Math.round((games(m.r) / total) * 100)}%</span>
                  </td>
                  <td>
                    <ResultBar r={m.r} side={side} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** White wins, draws and Black wins as one bar, like lichess' explorer. */
function ResultBar({ r, side }: { r: Results; side: 'white' | 'black' }) {
  const [w, d, b] = percents(r)
  const score = scoreOf(r, side)
  const label = `White ${w}%, draws ${d}%, Black ${b}%${score === undefined ? '' : ` (${side === 'white' ? 'White' : 'Black'} scores ${score}%)`}`
  return (
    <span className="library-result" role="img" aria-label={label} title={label}>
      <span className="library-result-white" style={{ width: `${w}%` }}>
        {w >= 15 && `${w}%`}
      </span>
      <span className="library-result-draw" style={{ width: `${d}%` }}>
        {d >= 15 && `${d}%`}
      </span>
      <span className="library-result-black" style={{ width: `${b}%` }}>
        {b >= 15 && `${b}%`}
      </span>
    </span>
  )
}
