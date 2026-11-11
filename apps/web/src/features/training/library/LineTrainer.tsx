import { createGame, type Move } from '@pawnia/chess'
import { useEffect, useMemo, useState } from 'react'
import { lineText } from '@/features/stats/format'
import { Board } from '@/shared/board/Board'
import { moveLabel } from './format'
import { HINT_AFTER, sameMove, yourPlies, type LearnScore } from './learnLine'

const NO_MOVES = new Map()
/** A breath before the opponent's move, so the user sees theirs land. */
const REPLY_DELAY_MS = 500

/**
 * Learning a line: first watch it move by move (with the coach's notes where the guide has them),
 * then play your side's moves from memory while the board plays the other side.
 */
export function LineTrainer({
  line,
  side,
  title,
  notes,
  onExit,
}: {
  line: string[]
  side: 'white' | 'black'
  title: string
  /** The coach's note per ply, where the guide has one. */
  notes: ReadonlyMap<number, string>
  onExit: () => void
}) {
  const [mode, setMode] = useState<'watch' | 'play'>('watch')
  return mode === 'watch' ? (
    <Watch
      line={line}
      side={side}
      title={title}
      notes={notes}
      onPlay={() => setMode('play')}
      onExit={onExit}
    />
  ) : (
    <Play
      line={line}
      side={side}
      title={title}
      notes={notes}
      onWatch={() => setMode('watch')}
      onExit={onExit}
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
  onPlay,
  onExit,
}: {
  line: string[]
  side: 'white' | 'black'
  title: string
  notes: ReadonlyMap<number, string>
  onPlay: () => void
  onExit: () => void
}) {
  const [ply, setPly] = useState(0)
  const { game, lastMove } = useMemo(() => positionAt(line, ply), [line, ply])
  const note = ply > 0 ? notes.get(ply) : undefined
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
        </div>
        <div className="training-actions">
          <button type="button" onClick={() => setPly((p) => p - 1)} disabled={ply === 0}>
            ◀ Back
          </button>
          <button type="button" onClick={() => setPly((p) => p + 1)} disabled={ply === line.length}>
            Next ▶
          </button>
          <button type="button" className="training-next" onClick={onPlay}>
            Play it yourself
          </button>
          <button type="button" onClick={onExit}>
            Back to the opening
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
}: {
  line: string[]
  side: 'white' | 'black'
  title: string
  notes: ReadonlyMap<number, string>
  onWatch: () => void
  onExit: () => void
}) {
  const yours = useMemo(() => new Set(yourPlies(line, side)), [line, side])
  const [ply, setPly] = useState(0)
  const [misses, setMisses] = useState(0)
  const [score, setScore] = useState<LearnScore>({ firstTry: 0, moves: 0 })
  const [feedback, setFeedback] = useState<{ tone: 'right' | 'wrong' | 'note'; text: string }>()
  const { game, lastMove } = useMemo(() => positionAt(line, ply), [line, ply])
  const done = ply === line.length
  const yourTurn = !done && yours.has(ply + 1)
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
    if (!yourTurn || misses < HINT_AFTER || !expected) return undefined
    const move = createGame(game.fen()).play(expected)?.move
    return (
      move && { arrows: [{ from: move.from, to: move.to, color: 'green' as const }], squares: [] }
    )
  }, [yourTurn, misses, expected, game])

  const advance = (shown: boolean) => {
    const at = ply + 1
    setScore((s) => ({
      moves: s.moves + 1,
      firstTry: s.firstTry + (!shown && misses === 0 ? 1 : 0),
    }))
    setMisses(0)
    const note = notes.get(at)
    setFeedback(
      shown
        ? { tone: 'note', text: `It was ${moveLabel(at, expected!)}.${note ? ` ${note}` : ''}` }
        : { tone: 'right', text: `${moveLabel(at, expected!)}, right.${note ? ` ${note}` : ''}` },
    )
    setPly(at)
  }

  const onMove = (move: Move) => {
    if (!yourTurn || !expected) return
    const san = createGame(game.fen()).play(move)?.move?.san
    if (san && sameMove(san, expected)) {
      advance(false)
      return
    }
    setMisses((m) => m + 1)
    setFeedback({
      tone: 'wrong',
      text:
        misses + 1 >= HINT_AFTER
          ? 'Not the line’s move. The arrow shows it.'
          : 'Not the line’s move. Try again.',
    })
  }

  const restart = () => {
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
          <p className="stats-note">Step 2 of 2: play your moves from memory.</p>
          <p className="line-trainer-move" role="status">
            {done
              ? `Line done: ${score.firstTry} of ${score.moves} moves right at the first try.`
              : yourTurn
                ? `Your move (move ${Math.ceil((ply + 1) / 2)})`
                : 'The other side moves…'}
          </p>
          {feedback && (
            <p className={`practice-feedback practice-${feedback.tone}`}>{feedback.text}</p>
          )}
        </div>
        <div className="training-actions">
          {yourTurn && misses > 0 && (
            <button type="button" onClick={() => advance(true)}>
              Show the move
            </button>
          )}
          {done && (
            <button type="button" className="training-next" onClick={restart}>
              Play it again
            </button>
          )}
          <button type="button" onClick={onWatch}>
            Watch it again
          </button>
          <button type="button" onClick={onExit}>
            Back to the opening
          </button>
        </div>
      </aside>
    </div>
  )
}
