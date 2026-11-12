import { createGame, type Move } from '@pawnia/chess'
import type { OpeningBody, PracticeCheckBody } from '@pawnia/contracts'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useServices } from '@/app/servicesContext'
import { Board } from '@/shared/board/Board'
import { useGame } from '@/shared/game/useGame'
import { lastMove } from '@/features/stats/format'
import { openingLabel, theoryText } from './format'
import { nextMoves, pickReply, PRACTICE_PLIES } from './practice'
import '@/shared/game/GamePanel.css'

const NO_MOVES = new Map()
/** A breath before the opponent's reply, so the user sees their own move land. */
const REPLY_DELAY_MS = 500

type Feedback = { tone: 'right' | 'note' | 'wrong'; text: ReactNode }

/**
 * Practising an opening: the user plays their colour from the start; the opponent plays the
 * replies the user really met (the common ones most often), else theory's. Each move is judged
 * by theory first, then the engine; a wrong one is taken back to try again.
 */
export function OpeningPractice({ opening, onExit }: { opening: OpeningBody; onExit: () => void }) {
  const { training, repertoire } = useServices()
  const table = useMemo(() => nextMoves(opening.lines), [opening.lines])
  const { game, view, update, replace } = useGame()
  const color = opening.color
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>()
  /** The last accepted move's check: theory's replies to go on with. */
  const [accepted, setAccepted] = useState<PracticeCheckBody>()
  /** A wrong try in the position on the board: its check (for the answer), and that it missed. */
  const [wrong, setWrong] = useState<PracticeCheckBody>()
  const [score, setScore] = useState({ moves: 0, firstTry: 0 })
  /** A missed position went into the repertoire. */
  const [keptMiss, setKeptMiss] = useState(false)

  const played = () => game.line().flatMap((node) => (node.move ? [node.move] : []))
  const sans = () => played().map((move) => move.san)
  const ply = played().length
  const theirTurn = view.turn !== color
  const met = table.get(sans().join(' '))
  const theory = (accepted?.replies ?? []).map((m) => m.san)
  /** The line is over: move 10 reached, or the opponent has no reply to play. */
  const done =
    ply >= PRACTICE_PLIES || (theirTurn && !busy && (met?.length ?? 0) === 0 && theory.length === 0)

  // The opponent's turn: a reply after a breath.
  useEffect(() => {
    if (done || busy || !theirTurn) return
    const reply = pickReply(met, theory)
    if (!reply) return
    const timer = setTimeout(() => update((g) => g.play(reply)), ply === 0 ? 0 : REPLY_DELAY_MS)
    return () => clearTimeout(timer)
    // The position decides; met and theory follow from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.fen, done, busy, theirTurn])

  /** Judges a move on the board; `answer` plays the shown answer (counts as a miss). */
  const judge = async (move: Move | string, answer = false) => {
    const before = played().map((m) => m.uci)
    const sanBefore = sans()
    let uci = ''
    update((g) => {
      uci = g.play(move)?.move?.uci ?? ''
    })
    if (!uci) return
    setBusy(true)
    try {
      const checked = await training.checkPractice({ moves: before, tried: uci })
      const line = [...sanBefore, checked.san]
      const theory = checked.theory.map((m) => m.san).filter((san) => san !== checked.san)
      const theoryNote =
        theory.length > 0 && checked.verdict !== 'theory'
          ? ` Theory has ${theoryText(line, theory)}.`
          : ''
      if (checked.verdict === 'wrong' && !answer) {
        update((g) => g.takeback())
        setWrong(checked)
        setFeedback({
          tone: 'wrong',
          text: <>{lastMove(line)} isn't good here. Try another move.</>,
        })
        return
      }
      const firstTry = !wrong && !answer
      if (!firstTry) {
        // A position missed here comes back for review: the line up to the right move.
        const label = openingLabel(opening.family, color)
        repertoire
          .add({
            side: color,
            title: `${label.charAt(0).toUpperCase()}${label.slice(1)}, missed in practice`,
            moves: line,
            source: 'practice',
          })
          .then(() => setKeptMiss(true))
          .catch(() => undefined)
      }
      setScore((s) => ({ moves: s.moves + 1, firstTry: s.firstTry + (firstTry ? 1 : 0) }))
      setWrong(undefined)
      setAccepted(checked)
      const text = answer ? (
        <>
          The answer was {lastMove(line)}
          {checked.verdict === 'theory' && ' (theory)'}.
        </>
      ) : checked.verdict === 'theory' ? (
        <>{lastMove(line)} is theory.</>
      ) : checked.verdict === 'good' ? (
        <>
          {lastMove(line)}: not theory, but as good as the engine's choice.{theoryNote}
        </>
      ) : checked.verdict === 'playable' ? (
        <>
          {lastMove(line)} is playable; better is {checked.best?.san}
          {checked.best && ` (${checked.best.line})`}.{theoryNote}
        </>
      ) : (
        <>{lastMove(line)}.</>
      )
      setFeedback({
        tone: answer ? 'note' : checked.verdict === 'playable' ? 'note' : 'right',
        text,
      })
    } catch (error) {
      update((g) => g.takeback())
      setFeedback({ tone: 'wrong', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const showAnswer = () => {
    const answer = wrong?.theory[0]?.uci ?? wrong?.best?.uci
    if (answer) void judge(answer, true)
  }

  const restart = () => {
    replace(createGame())
    setFeedback(undefined)
    setAccepted(undefined)
    setWrong(undefined)
    setScore({ moves: 0, firstTry: 0 })
  }

  const yourTurn = view.turn === color && !busy && !done
  return (
    <div className="layout opening-practice">
      <section className="board-column">
        <Board
          fen={view.fen}
          orientation={color}
          turnColor={view.turn}
          dests={yourTurn ? view.dests : NO_MOVES}
          {...(view.lastMove && { lastMove: view.lastMove })}
          check={view.check}
          isPromotion={(from, to) => game.isPromotion(from, to)}
          onMove={(move) => void judge(move)}
        />
      </section>
      <aside className="panel training-panel" aria-label="Practice">
        <div className="training-text">
          <h2>
            Practise: {openingLabel(opening.family, color)}{' '}
            <span className="stats-note">as {color === 'white' ? 'White' : 'Black'}</span>
          </h2>
          <p className="stats-note">
            Your opponent plays the replies you met in your games, the common ones most often. Up to
            move {PRACTICE_PLIES / 2}.
          </p>
          {done ? (
            <p className="practice-done" role="status">
              {ply >= PRACTICE_PLIES
                ? `Move ${PRACTICE_PLIES / 2} reached`
                : 'Theory and your games stop here'}
              : {score.firstTry} of {score.moves} moves right at the first try.
            </p>
          ) : (
            <p className="practice-turn" role="status">
              {busy ? 'Checking…' : yourTurn ? 'Your move.' : 'Your opponent is thinking…'}
            </p>
          )}
          {feedback && (
            <p className={`practice-feedback practice-${feedback.tone}`}>{feedback.text}</p>
          )}
          {keptMiss && (
            <p className="stats-note">
              Missed positions go into <Link to="/training/repertoire">your repertoire</Link> to
              review.
            </p>
          )}
        </div>
        <div className="training-actions">
          {wrong && !done && (
            <button type="button" onClick={showAnswer} disabled={busy}>
              Show the answer
            </button>
          )}
          {done && (
            <button type="button" className="training-next" onClick={restart}>
              Practise again
            </button>
          )}
          <button type="button" onClick={onExit}>
            Back to the opening
          </button>
        </div>
      </aside>
    </div>
  )
}
