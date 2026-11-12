import { createGame, type Move } from '@pawnia/chess'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { lineText } from '@/features/stats/format'
import { Board, type BoardDrawing } from '@/shared/board/Board'
import { arrowsWanted, nextStepArrows, rememberArrows } from './arrows'
import type { Pitfall } from './traps'
import { moveLabel } from './format'
import { helpFor, HINT_AFTER, sameMove, verdictText, yourPlies, type LearnScore } from './learnLine'

const NO_MOVES = new Map()
/** A breath before the opponent's move, so the user sees theirs land. */
const REPLY_DELAY_MS = 500
/** The run from which a line is played from memory. */
const FROM_MEMORY = 2
/** How long a move stays on the board when the line plays by itself. */
const AUTOPLAY_MS = 1600

/**
 * Learning a line: first watch it move by move (with the coach's notes where the guide has them),
 * then play your side's moves from memory while the board plays the other side.
 */
export function LineTrainer({
  line,
  side,
  title,
  notes,
  drawings,
  pitfalls,
  onExplain,
  onExit,
  start = 'watch',
  exitLabel = 'Back to the opening',
  onDone,
  onNext,
  onAdd,
}: {
  line: string[]
  side: 'white' | 'black'
  title: string
  /** The coach's note per ply, where the guide has one. */
  notes: ReadonlyMap<number, string>
  /** The coach's drawing per ply, where the guide has one: shown while watching. */
  drawings?: ReadonlyMap<number, BoardDrawing>
  /** A move to stay away from, by ply: tried, it gets its own answer (a trap's bait). */
  pitfalls?: ReadonlyMap<number, Pitfall>
  /** Has the coach write a note for every move of the line; offered while some have none. */
  onExplain?: () => Promise<unknown>
  onExit: () => void
  /**
   * Begin by playing from memory (a review) instead of watching. Learning a line, the help fades
   * run by run; a review has none, and tells the coach's note only where a move was missed.
   */
  start?: 'watch' | 'play'
  exitLabel?: string
  /** Hears how a run through the line went, once it is done. */
  onDone?: (score: LearnScore) => void
  /** Offered at the end instead of playing it again (the next line of a review). */
  onNext?: () => void
  /** Offered at the end: keeps the line in the repertoire. */
  onAdd?: () => Promise<unknown>
}) {
  const [mode, setMode] = useState<'watch' | 'play'>(start)
  return mode === 'watch' ? (
    <Watch
      line={line}
      side={side}
      title={title}
      notes={notes}
      {...(drawings && { drawings })}
      {...(onExplain && { onExplain })}
      onPlay={() => setMode('play')}
      onExit={onExit}
      exitLabel={exitLabel}
    />
  ) : (
    <Play
      line={line}
      side={side}
      title={title}
      notes={notes}
      onWatch={() => setMode('watch')}
      onExit={onExit}
      exitLabel={exitLabel}
      review={start === 'play'}
      {...(pitfalls && { pitfalls })}
      {...(onDone && { onDone })}
      {...(onNext && { onNext })}
      {...(onAdd && { onAdd })}
    />
  )
}

/** The position after the first `ply` moves of the line, and the last move's squares. */
function positionAt(line: readonly string[], ply: number) {
  const game = createGame()
  for (const san of line.slice(0, ply)) game.play(san)
  const last = game.current.move
  return {
    game,
    lastMove: last ? ([last.from, last.to] as [typeof last.from, typeof last.to]) : undefined,
  }
}

function Watch({
  line,
  side,
  title,
  notes,
  drawings,
  onExplain,
  onPlay,
  onExit,
  exitLabel,
}: {
  line: string[]
  side: 'white' | 'black'
  title: string
  notes: ReadonlyMap<number, string>
  drawings?: ReadonlyMap<number, BoardDrawing>
  onExplain?: () => Promise<unknown>
  onPlay: () => void
  onExit: () => void
  exitLabel: string
}) {
  const [ply, setPly] = useState(0)
  const [autoplay, setAutoplay] = useState(false)
  /** The coach is writing the line's notes, or why it couldn't. */
  const [explaining, setExplaining] = useState<'writing' | string>()
  const [arrowsOn, setArrowsOn] = useState(arrowsWanted)
  const { game, lastMove } = useMemo(() => positionAt(line, ply), [line, ply])
  const note = ply > 0 ? notes.get(ply) : undefined
  const playing = autoplay && ply < line.length
  /** What the coach drew for the move just made: its idea, in front of the next moves. */
  const idea = arrowsOn && ply > 0 ? drawings?.get(ply) : undefined
  const drawing = useMemo(() => {
    if (!arrowsOn) return undefined
    const next = nextStepArrows(line, ply, side, { allFaint: idea !== undefined })
    return idea ? { arrows: [...next.arrows, ...idea.arrows], squares: idea.squares } : next
  }, [arrowsOn, line, ply, side, idea])
  /** A step by hand; the line stops playing by itself. */
  const step = (by: number) => {
    setAutoplay(false)
    setPly((p) => Math.min(line.length, Math.max(0, p + by)))
  }

  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => setPly((p) => p + 1), AUTOPLAY_MS)
    return () => clearTimeout(timer)
  }, [playing, ply])

  // ← and → step through the line, as on the analysis board.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
      const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (by === 0) return
      e.preventDefault()
      setAutoplay(false)
      setPly((p) => Math.min(line.length, Math.max(0, p + by)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [line.length])

  return (
    <div className="layout line-trainer">
      <section className="board-column">
        <Board
          fen={game.fen()}
          orientation={side}
          turnColor={game.turn()}
          dests={NO_MOVES}
          {...(lastMove && { lastMove })}
          check={game.isCheck()}
          isPromotion={() => false}
          onMove={() => undefined}
          {...(drawing && { drawing })}
        />
      </section>
      <aside className="panel training-panel" aria-label="Learn the line">
        <div className="training-text">
          <h2>Learn: {title}</h2>
          <p className="library-card-line">{lineText(line)}</p>
          <p className="stats-note">Step 1 of 2: watch the line. Then you play it from memory.</p>
          <p className="line-trainer-move" role="status">
            {ply === 0 ? 'The start position.' : moveLabel(ply, line[ply - 1]!)}
          </p>
          {note && <p>{note}</p>}
          {onExplain && notes.size < line.length && (
            <p className="line-trainer-explain">
              <button
                type="button"
                disabled={explaining === 'writing'}
                onClick={() => {
                  setExplaining('writing')
                  onExplain().then(
                    () => setExplaining(undefined),
                    (error: unknown) =>
                      setExplaining(error instanceof Error ? error.message : String(error)),
                  )
                }}
              >
                {explaining === 'writing'
                  ? 'The coach is writing… (up to a minute)'
                  : 'Explain every move'}
              </button>{' '}
              <span className="stats-note">
                The coach writes a note for each move of this line, once. With the Claude API as
                coach this is one paid request.
              </span>
            </p>
          )}
          {explaining && explaining !== 'writing' && (
            <p className="message message-error" role="alert">
              {explaining}
            </p>
          )}
          {idea ? (
            <p className="stats-note">
              Strong arrows and circles: the coach’s drawing of this move’s idea. Faint and
              numbered: the next moves.
            </p>
          ) : (
            arrowsOn &&
            ply < line.length && (
              <p className="stats-note">
                The arrows show the next moves in order: yours green, the other side’s grey.
              </p>
            )
          )}
        </div>
        <div className="training-actions">
          <button type="button" onClick={() => step(-1)} disabled={ply === 0}>
            ◀ Back
          </button>
          <button type="button" onClick={() => step(1)} disabled={ply === line.length}>
            Next ▶
          </button>
          <button
            type="button"
            onClick={() => {
              // From the end it starts over.
              if (!playing && ply === line.length) setPly(0)
              setAutoplay(!playing)
            }}
          >
            {playing ? 'Pause' : 'Play through'}
          </button>
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
          <button type="button" className="training-next" onClick={onPlay}>
            Play it yourself
          </button>
          <button type="button" onClick={onExit}>
            {exitLabel}
          </button>
        </div>
      </aside>
    </div>
  )
}

function Play({
  line,
  side,
  title,
  notes,
  onWatch,
  onExit,
  exitLabel,
  review,
  pitfalls,
  onDone,
  onNext,
  onAdd,
}: {
  line: string[]
  side: 'white' | 'black'
  title: string
  notes: ReadonlyMap<number, string>
  onWatch: () => void
  onExit: () => void
  exitLabel: string
  /** A review: from memory, the coach's notes only where a move was missed. */
  review: boolean
  pitfalls?: ReadonlyMap<number, Pitfall>
  onDone?: (score: LearnScore) => void
  onNext?: () => void
  onAdd?: () => Promise<unknown>
}) {
  const { training } = useServices()
  const yours = useMemo(() => new Set(yourPlies(line, side)), [line, side])
  /** How many times the line was played through: the help fades with each run. */
  const [run, setRun] = useState(0)
  const [arrowsOn] = useState(arrowsWanted)
  const help = helpFor(review || !arrowsOn ? undefined : run)
  const [ply, setPly] = useState(0)
  const [misses, setMisses] = useState(0)
  const [score, setScore] = useState<LearnScore>({ firstTry: 0, moves: 0 })
  const [feedback, setFeedback] = useState<{ tone: 'right' | 'wrong' | 'note'; text: string }>()
  const { game, lastMove } = useMemo(() => positionAt(line, ply), [line, ply])
  const done = ply === line.length
  const yourTurn = !done && yours.has(ply + 1)
  const [added, setAdded] = useState<'adding' | 'added' | string>()
  // Told once per run, when the last move is on the board.
  const told = useRef(false)
  useEffect(() => {
    if (!done || told.current) return
    told.current = true
    onDone?.(score)
  }, [done, score, onDone])
  // A new map after each miss, so the board puts the wrongly dropped piece back.
  const dests = useMemo(
    () => (yourTurn ? new Map(game.dests()) : NO_MOVES),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `misses` resets the board
    [game, yourTurn, misses],
  )

  // The other side's moves come by themselves.
  useEffect(() => {
    if (done || yourTurn) return
    const timer = setTimeout(() => setPly((p) => p + 1), ply === 0 ? 0 : REPLY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [ply, done, yourTurn])

  const expected = line[ply]
  const hint = useMemo(() => {
    if (!yourTurn || misses < help.arrowAfter || !expected) return undefined
    const move = createGame(game.fen()).play(expected)?.move
    return (
      move && { arrows: [{ from: move.from, to: move.to, color: 'green' as const }], squares: [] }
    )
  }, [yourTurn, misses, expected, game, help.arrowAfter])

  const advance = (shown: boolean) => {
    const at = ply + 1
    setScore((s) => ({
      moves: s.moves + 1,
      firstTry: s.firstTry + (!shown && misses === 0 ? 1 : 0),
    }))
    setMisses(0)
    judging.current++
    // A review tells the note only where the move didn't come by itself.
    const note = !review || shown || misses > 0 ? notes.get(at) : undefined
    setFeedback(
      shown
        ? { tone: 'note', text: `It was ${moveLabel(at, expected!)}.${note ? ` ${note}` : ''}` }
        : { tone: 'right', text: `${moveLabel(at, expected!)}, right.${note ? ` ${note}` : ''}` },
    )
    setPly(at)
  }

  /** Counts the wrong tries, so a verdict that arrives late isn't shown on a newer one. */
  const judging = useRef(0)

  const onMove = (move: Move) => {
    if (!yourTurn || !expected) return
    const tried = createGame(game.fen()).play(move)?.move
    if (tried && sameMove(tried.san, expected)) {
      advance(false)
      return
    }
    setMisses((m) => m + 1)
    const next = misses + 1 >= help.arrowAfter ? 'The arrow shows it.' : 'Try again.'
    const pitfall = pitfalls?.get(ply + 1)
    if (tried && pitfall && sameMove(tried.san, pitfall.san)) {
      judging.current++
      setFeedback({ tone: 'wrong', text: `${pitfall.text} ${next}` })
      return
    }
    setFeedback({ tone: 'wrong', text: `Not the line’s move. ${next}` })
    if (!tried) return
    // What the move is worth otherwise: theory of another line, playable, or a mistake.
    const token = ++judging.current
    const before = game.line().flatMap((node) => (node.move ? [node.move.uci] : []))
    training.checkPractice({ moves: before, tried: tried.uci }).then(
      ({ verdict }) => {
        if (judging.current !== token) return
        setFeedback({
          tone: verdict === 'wrong' ? 'wrong' : 'note',
          text: `${verdictText(moveLabel(ply + 1, tried.san), verdict)} ${next}`,
        })
      },
      // No book or engine on this server: the plain answer stays.
      () => undefined,
    )
  }

  const restart = (nextRun = run + 1) => {
    told.current = false
    judging.current++
    setRun(nextRun)
    setPly(0)
    setMisses(0)
    setScore({ firstTry: 0, moves: 0 })
    setFeedback(undefined)
  }

  return (
    <div className="layout line-trainer">
      <section className="board-column">
        <Board
          fen={game.fen()}
          orientation={side}
          turnColor={game.turn()}
          dests={dests}
          {...(lastMove && { lastMove })}
          check={game.isCheck()}
          isPromotion={(from, to) => game.isPromotion(from, to)}
          onMove={onMove}
          {...(hint && { drawing: hint })}
        />
      </section>
      <aside className="panel training-panel" aria-label="Learn the line">
        <div className="training-text">
          <h2>Learn: {title}</h2>
          <p className="stats-note">
            {review ? 'Play your moves from memory.' : `Step 2 of 2: ${help.step}`}
          </p>
          <p className="line-trainer-move" role="status">
            {done
              ? help.arrowAfter === 0
                ? 'Line done, with the arrows.'
                : `Line done: ${score.firstTry} of ${score.moves} moves right at the first try.`
              : yourTurn
                ? `Your move (move ${Math.ceil((ply + 1) / 2)})`
                : 'The other side moves…'}
          </p>
          {feedback && (
            <p className={`practice-feedback practice-${feedback.tone}`}>{feedback.text}</p>
          )}
          {added === 'added' && (
            <p className="stats-note" role="status">
              In your repertoire: it comes back for review.
            </p>
          )}
          {added && added !== 'added' && added !== 'adding' && (
            <p className="message message-error" role="alert">
              {added}
            </p>
          )}
        </div>
        <div className="training-actions">
          {yourTurn && misses > 0 && (
            <button type="button" onClick={() => advance(true)}>
              Show the move
            </button>
          )}
          {done && onNext && (
            <button type="button" className="training-next" onClick={onNext}>
              Next line
            </button>
          )}
          {done && !onNext && (
            <button type="button" className="training-next" onClick={() => restart()}>
              {helpFor(review || !arrowsOn ? undefined : run + 1).again}
            </button>
          )}
          {!done && help.arrowAfter < HINT_AFTER && (
            <button type="button" onClick={() => restart(FROM_MEMORY)}>
              Without help
            </button>
          )}
          {done && onAdd && added !== 'added' && (
            <button
              type="button"
              disabled={added === 'adding'}
              onClick={() => {
                setAdded('adding')
                onAdd().then(
                  () => setAdded('added'),
                  (error: unknown) =>
                    setAdded(error instanceof Error ? error.message : String(error)),
                )
              }}
            >
              Add to my repertoire
            </button>
          )}
          <button type="button" onClick={onWatch}>
            Watch it again
          </button>
          <button type="button" onClick={onExit}>
            {exitLabel}
          </button>
        </div>
      </aside>
    </div>
  )
}
