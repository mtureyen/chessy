import type { LibraryOpeningBody, OpeningLibraryBody } from '@pawnia/contracts'
import { createGame, exportPgn } from '@pawnia/chess'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearch } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { lineText, scoreText } from '@/features/stats/format'
import { Board, type BoardDrawing } from '@/shared/board/Board'
import {
  lineKey,
  openingProgress,
  progressText,
  useRepertoire,
  type Progress,
} from '../repertoire/progress'
import { TrainingTabs } from '../TrainingTabs'
import { arrowsWanted, explorerArrows, openingPaths, rememberArrows } from './arrows'
import { Guide } from './Guide'
import { guideDrawings, guideNotes } from './learnLine'
import { LibraryPractice } from './LibraryPractice'
import { LineTrainer } from './LineTrainer'
import { bandPlayers } from './practice'
import { avoidDrill, springDrill, type TrapDrill } from './traps'
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
  const kept = useRepertoire().data ?? []
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
                  <OpeningCard opening={opening} progress={openingProgress(kept, opening.id)} />
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

function OpeningCard({ opening, progress }: { opening: Summary; progress: Progress }) {
  const yours = progressText(progress)
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
      {yours && <span className="library-progress">{yours}</span>}
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
  const { openingLibrary, repertoire, training } = useServices()
  const client = useQueryClient()
  const kept = useRepertoire().data
  const progress = progressText(openingProgress(kept ?? [], opening.id))
  const keptLines = useMemo(
    () => new Set((kept ?? []).map((l) => lineKey(l.side, l.moves))),
    [kept],
  )
  // The user's own games with it: the same query as "My openings" starts with.
  const mine = useQuery({
    queryKey: ['openings', YOUR_GAMES, 'all'],
    queryFn: () => training.openings({ last: YOUR_GAMES }),
    retry: false,
  })
  const yours = mine.data?.openings.find(
    (o) => o.color === opening.side && o.family === opening.name,
  )
  const main = opening.main.split(' ')
  const [path, setPath] = useState<string[]>(main)
  const [band, setBand] = useState<BandChoice>('all')
  const [learning, setLearning] = useState<string[]>()
  /** A trap being drilled, from one side. */
  const [drill, setDrill] = useState<TrapDrill>()
  const [practising, setPractising] = useState(false)
  /** The move pointed at in the list of what's played, with the position it belongs to. */
  const [pointed, setPointed] = useState<{ at: string; san: string }>()
  const paths = useMemo(() => openingPaths(opening.tree), [opening.tree])
  /** The position whose drawing by the coach is on the board: a move picked in the guide. */
  const [ideaAt, setIdeaAt] = useState<string>()
  /** To a position by any other way: the board shows what's played there again. */
  const go = (next: string[]) => {
    setIdeaAt(undefined)
    setPath(next)
  }
  // The same query as the guide's section: its notes go with the moves they are about.
  const guide = useQuery({
    queryKey: ['opening-library', opening.id, 'guide'],
    queryFn: () => openingLibrary.guide(opening.id),
  })
  // The coach's notes on the very line being learned, where they were written: they come before
  // the guide's, which are about the main line only.
  const studied = drill?.line ?? learning
  const lineNotesKey = ['opening-library', opening.id, 'line-notes', studied?.join(' ')]
  const lineNotes = useQuery({
    queryKey: lineNotesKey,
    queryFn: () => openingLibrary.lineNotes(opening.id, studied!),
    enabled: studied !== undefined,
  })
  const noted = lineNotes.data?.moves ?? guide.data?.moves ?? []
  // Lives here, not in the trainer's steps: going from watching to playing and back must not
  // forget that the coach is writing, and offer a second, paid, writing.
  const explaining = useMutation({
    mutationFn: (line: string[]) => openingLibrary.writeLineNotes(opening.id, line),
    onSuccess: (notes, line) =>
      client.setQueryData(['opening-library', opening.id, 'line-notes', line.join(' ')], notes),
  })
  const explain = studied && {
    run: () => explaining.mutate(studied),
    busy: explaining.isPending,
    ...(explaining.error && { error: explaining.error.message }),
  }
  /** A line's name: the named line it is, or the opening and its moves. */
  const titleOf = (line: string[]) =>
    opening.tree.find((n) => n.name && n.moves.join(' ') === line.join(' '))?.name ??
    `${opening.name}, ${lineText(line)}`
  /** Keeps a line in the repertoire; what shows the repertoire hears of it. */
  const add = async (line: Parameters<typeof repertoire.add>[0]) => {
    const added = await repertoire.add(line)
    void client.invalidateQueries({ queryKey: ['repertoire'] })
    return added
  }
  const keep = (line: string[]) =>
    add({ side: opening.side, title: titleOf(line), moves: line, openingId: opening.id })
  if (practising) {
    return <LibraryPractice opening={opening} band={band} onExit={() => setPractising(false)} />
  }
  if (drill) {
    const title = `${opening.name}, ${drill.title.charAt(0).toLowerCase()}${drill.title.slice(1)}`
    return (
      <LineTrainer
        line={drill.line}
        side={drill.side}
        title={title}
        // The guide's notes on the way there, the trap's own where it springs.
        notes={new Map([...guideNotes(drill.line, noted), ...drill.notes])}
        drawings={guideDrawings(drill.line, noted)}
        pitfalls={drill.pitfalls}
        {...(explain && { explain })}
        onAdd={() =>
          add({
            side: drill.side,
            title,
            moves: drill.line,
            openingId: opening.id,
          })
        }
        onExit={() => {
          go(drill.line)
          setDrill(undefined)
        }}
      />
    )
  }
  if (learning) {
    return (
      <LineTrainer
        line={learning}
        side={opening.side}
        title={titleOf(learning)}
        onAdd={() => keep(learning)}
        notes={guideNotes(learning, noted)}
        drawings={guideDrawings(learning, noted)}
        {...(explain && { explain })}
        onExit={() => {
          setPath(learning)
          setLearning(undefined)
        }}
      />
    )
  }
  const idea =
    ideaAt === path.join(' ')
      ? guideDrawings(path, guide.data?.moves ?? []).get(path.length)
      : undefined
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
          <p>
            <button
              type="button"
              className="openings-practise"
              title={`Your opponent plays what ${bandPlayers(band)} really play`}
              onClick={() => setPractising(true)}
            >
              Practise against real replies
            </button>
          </p>
          {progress && (
            <p className="library-progress">
              {progress}. <Link to="/training/repertoire">Review them</Link>
            </p>
          )}
          {mine.data && (
            <p className="stats-note">
              {yours ? (
                <>
                  You played it {yours.tally.games} {yours.tally.games === 1 ? 'time' : 'times'} in
                  your last {mine.data.window.found} games, scoring {scoreText(yours.tally)}.{' '}
                  <Link
                    to="/training/openings"
                    search={{ color: yours.color, family: yours.family }}
                  >
                    Your games with it
                  </Link>
                </>
              ) : (
                `Not in your last ${mine.data.window.found} games.`
              )}
            </p>
          )}
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
            {...(idea && { idea })}
            onNoIdea={() => setIdeaAt(undefined)}
            onPath={go}
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
            onPath={go}
            onPoint={(san) => setPointed(san ? { at: path.join(' '), san } : undefined)}
          />
        </aside>
      </div>

      <Guide
        opening={opening}
        path={path}
        onPath={(next) => {
          setPath(next)
          setIdeaAt(next.join(' '))
        }}
        onLearn={(line) => setLearning(line)}
      />

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
                <TrapActions
                  trap={trap}
                  onShow={() => go(trap.moves ? trap.moves.split(' ') : [])}
                  onDrill={setDrill}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <NamedLines opening={opening} band={band} path={path} kept={keptLines} onPath={go} />
    </>
  )
}

/** A trap's buttons: to the board, and its drills from both sides. */
function TrapActions({
  trap,
  onShow,
  onDrill,
}: {
  trap: LibraryOpeningBody['traps'][number]
  onShow: () => void
  onDrill: (drill: TrapDrill) => void
}) {
  const spring = useMemo(() => springDrill(trap), [trap])
  const avoid = useMemo(() => avoidDrill(trap), [trap])
  const as = (side: 'white' | 'black') => (side === 'white' ? 'White' : 'Black')
  return (
    <div className="library-trap-actions">
      <button type="button" onClick={onShow}>
        Show on the board
      </button>
      {spring && (
        <button
          type="button"
          title={`Learn it as ${as(spring.side)}: the way there, then how to punish ${trap.bait}`}
          onClick={() => onDrill(spring)}
        >
          Spring it <span className="stats-note">as {as(spring.side)}</span>
        </button>
      )}
      {avoid && (
        <button
          type="button"
          title={`Learn it as ${as(avoid.side)}: the way there, then the move that stays out of it`}
          onClick={() => onDrill(avoid)}
        >
          Avoid it <span className="stats-note">as {as(avoid.side)}</span>
        </button>
      )}
    </div>
  )
}

/** The window of the user's games the opening is looked up in: what "My openings" starts with. */
const YOUR_GAMES = 300

/** The named lines shown before "Show all". */
const SHOWN_LINES = 15

/** The variations theory names, the most played first; the rarest behind "Show all". */
function NamedLines({
  opening,
  band,
  path,
  kept,
  onPath,
}: {
  opening: LibraryOpeningBody
  band: BandChoice
  path: string[]
  /** The lines in the user's repertoire, by side and moves. */
  kept: ReadonlySet<string>
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
                <span className="library-line-name">
                  {shortName(node.name!, opening.name)}
                  {kept.has(lineKey(opening.side, node.moves)) && (
                    <span className="library-chip library-chip-low">In your repertoire</span>
                  )}
                </span>
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
  idea,
  onNoIdea,
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
  /** The coach's drawing for this position, shown in place of what's played. */
  idea?: BoardDrawing
  onNoIdea: () => void
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
        {...((idea ?? drawing) && { drawing: idea ?? drawing })}
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
        <Link
          to="/analysis"
          search={path.length > 0 ? { pgn: exportPgn(game), coach: true } : { coach: true }}
          className="library-ask"
          title="Opens this position on the analysis board, with the coach to ask"
        >
          Ask the coach
        </Link>
      </div>
      {idea ? (
        <p className="stats-note library-arrows">
          The coach’s drawing of this move’s idea.
          <button type="button" onClick={onNoIdea}>
            Show what’s played here
          </button>
        </p>
      ) : (
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
      )}
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
