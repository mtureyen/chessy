import { createGame, type Move } from '@pawnia/chess'
import type { PracticeCheckBody } from '@pawnia/contracts'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useServices } from '@/app/servicesContext'
import { Board } from '@/shared/board/Board'
import { useGame } from '@/shared/game/useGame'
import { lastMove } from '@/features/stats/format'
import { theoryText } from './format'
import { pickReply, PRACTICE_PLIES, type Candidate } from './practice'
import '@/shared/game/GamePanel.css'

const NO_MOVES = new Map()
/** A breath before the opponent's reply, so the user sees their own move land. */
const REPLY_DELAY_MS = 500

type Feedback = { tone: 'right' | 'note' | 'wrong'; text: ReactNode }

/** What a practice is about: whose moves the opponent plays, and how it is told. */
export interface PracticeSetup {
  heading: ReactNode
  intro: string
  color: 'white' | 'black'
  /** The moves on the board when the practice starts (SAN): where an opening begins. */
  start?: readonly string[]
  /** What the opponent picks its reply from after these moves (SAN), each with its weight. */
  replies: (sans: readonly string[]) => Promise<readonly Candidate[]>
  /** Whether theory's replies stand in where `replies` has none. */
  theoryToo: boolean
  /** Something to say about the opponent's reply (the last of these moves), once it is played. */
  about?: (sans: readonly string[]) => Promise<string | undefined>
  /** What a missed position is kept as in the repertoire. */
  missed: { title: string; openingId?: string }
  /** Why the practice is over where the opponent has no reply. */
  ending: string
}

/** The game a practice starts from. */
function startGame(start: readonly string[] = []) {
  const game = createGame()
  for (const san of start) game.play(san)
  return game
}

/**
 * Practising an opening: the user plays their colour; the opponent picks its replies from what
 * the setup gives (the common ones most often). Each move is judged by theory first, then the
 * engine; a wrong one is taken back to try again.
 */
export function PracticeBoard({ setup, onExit }: { setup: PracticeSetup; onExit: () => void }) {
  const { training, repertoire } = useServices()
  const { game, view, update, replace } = useGame({ initial: () => startGame(setup.start) })
  const color = setup.color
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>()
  /** The last accepted move's check: theory's replies to go on with. */
  const [accepted, setAccepted] = useState<PracticeCheckBody>()
  /** A wrong try in the position on the board: its check (for the answer), and that it missed. */
  const [wrong, setWrong] = useState<PracticeCheckBody>()
  const [score, setScore] = useState({ moves: 0, firstTry: 0 })
  /** A missed position went into the repertoire. */
  const [keptMiss, setKeptMiss] = useState(false)
  /** The opponent has no reply in the position on the board. */
  const [out, setOut] = useState(false)
  /** What there is to say about the opponent's last reply. */
  const [about, setAbout] = useState<string>()
  /** Counts the positions, so what is said about an earlier reply doesn't show on a later one. */
  const telling = useRef(0)

  const played = () => game.line().flatMap((node) => (node.move ? [node.move] : []))
  const sans = () => played().map((move) => move.san)
  const ply = played().length
  const theirTurn = view.turn !== color
  const theory = setup.theoryToo ? (accepted?.replies ?? []).map((m) => m.san) : []
  /** The line is over: move 10 reached, or the opponent has no reply to play. */
  const done = ply >= PRACTICE_PLIES || (theirTurn && !busy && out)

  // The opponent's turn: a reply after a breath.
  useEffect(() => {
    if (done || busy || !theirTurn) return
    let stale = false
    const line = sans()
    const reply = async () => {
      const move = pickReply(await setup.replies(line).catch(() => []), theory)
      if (stale) return
      if (!move) {
        setOut(true)
        return
      }
      update((g) => g.play(move))
      const token = ++telling.current
      const text = await setup.about?.([...line, move]).catch(() => undefined)
      if (telling.current === token) setAbout(text)
    }
    const first = ply === (setup.start?.length ?? 0)
    const timer = setTimeout(() => void reply(), first ? 0 : REPLY_DELAY_MS)
    return () => {
      stale = true
      clearTimeout(timer)
    }
    // The position decides; the replies and theory follow from it.
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
    telling.current++
    setAbout(undefined)
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
        repertoire
          .add({
            side: color,
            title: setup.missed.title,
            moves: line,
            source: 'practice',
            ...(setup.missed.openingId && { openingId: setup.missed.openingId }),
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
    replace(startGame(setup.start))
    telling.current++
    setAbout(undefined)
    setOut(false)
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
            Practise: {setup.heading}{' '}
            <span className="stats-note">as {color === 'white' ? 'White' : 'Black'}</span>
          </h2>
          <p className="stats-note">
            {setup.intro} Up to move {PRACTICE_PLIES / 2}.
          </p>
          {done ? (
            <p className="practice-done" role="status">
              {ply >= PRACTICE_PLIES ? `Move ${PRACTICE_PLIES / 2} reached` : setup.ending}:{' '}
              {score.firstTry} of {score.moves} moves right at the first try.
            </p>
          ) : (
            <p className="practice-turn" role="status">
              {busy ? 'Checking…' : yourTurn ? 'Your move.' : 'Your opponent is thinking…'}
            </p>
          )}
          {feedback && (
            <p className={`practice-feedback practice-${feedback.tone}`}>{feedback.text}</p>
          )}
          {about && !done && <p className="practice-feedback practice-note">{about}</p>}
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
