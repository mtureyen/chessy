import type { GameReview } from '@chessy/analysis'
import { createGame, type Color, type Move, type SquareName } from '@chessy/chess'
import type { CoachTryBody, CoachWalkthroughBody } from '@chessy/contracts'
import { phaseAccuracy } from '@chessy/history'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { Markdown } from '@/features/coach/Markdown'
import type { PlacedDrawing } from '@/features/coach/useCoachChat'
import { ClassBadge } from './ClassBadge'
import {
  momentDrawing,
  walkthroughSteps,
  wentWrong,
  type BoardTry,
  type WalkthroughStep,
} from './walkthrough'

export interface CoachWalkthroughProps {
  review: GameReview
  /** The colour the user played, if they played the game. */
  side: Color | undefined
  onSelectPly: (ply: number) => void
  onShow: (drawing: PlacedDrawing) => void
  /** Goes on with the coach in its chat, on the position on the board. */
  onAsk: () => void
  /** The walkthrough opens or closes: the board turns to the user's side, the engine rests. */
  onOpen: () => void
  onClose: () => void
  /** Hands the board over for a try at a better move; undefined takes it back. */
  onTry: (attempt: BoardTry | undefined) => void
}

/** Where the user's search for the better move stands. */
type Search =
  | { status: 'looking' }
  | { status: 'checking'; san: string }
  | { status: 'judged'; answer: CoachTryBody }
  | { status: 'failed'; message: string }

/** The coach going through a reviewed game, one stop at a time, written once and kept. */
export function CoachWalkthrough(props: CoachWalkthroughProps) {
  const { review, side, onOpen, onClose, onTry } = props
  const { coach } = useServices()
  const [open, setOpen] = useState(false)
  const load = useMutation({
    mutationFn: (regenerate: boolean) =>
      coach.walkthrough({
        startFen: review.startFen,
        moves: review.moves.map((move) => move.uci),
        ...(side && { side }),
        ...(regenerate && { regenerate }),
      }),
    onSuccess: () => {
      setOpen(true)
      onOpen()
    },
  })

  if (open && load.data) {
    return (
      <Stepper
        {...props}
        walkthrough={load.data}
        rewriting={load.isPending}
        onRewrite={() => load.mutate(true)}
        onDone={() => {
          setOpen(false)
          onTry(undefined)
          onClose()
        }}
      />
    )
  }
  return (
    <div className="walkthrough-start">
      <button
        type="button"
        className="review-start-button"
        disabled={load.isPending}
        onClick={() => load.mutate(false)}
      >
        {load.isPending ? 'Your coach is going through the game…' : 'Walk me through it'}
      </button>
      {load.error && (
        <p className="message message-error" role="alert">
          {load.error.message}
        </p>
      )}
    </div>
  )
}

function Stepper({
  review,
  side,
  onSelectPly,
  onShow,
  onAsk,
  onTry,
  walkthrough,
  rewriting,
  onRewrite,
  onDone,
}: CoachWalkthroughProps & {
  walkthrough: CoachWalkthroughBody
  rewriting: boolean
  onRewrite: () => void
  onDone: () => void
}) {
  const { coach } = useServices()
  const steps = walkthroughSteps(walkthrough, review)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [search, setSearch] = useState<Search>()
  /** The latest try; an answer to an older one, or after the user moved on, is dropped. */
  const searchId = useRef(0)
  const step = steps[Math.min(index, steps.length - 1)]!

  const showMoment = (at: WalkthroughStep, reveal: boolean) => {
    if (at.kind === 'opening') onSelectPly(at.opening.ply)
    if (at.kind !== 'moment') return
    const drawing = momentDrawing(at.move, review, reveal)
    if (drawing) onShow(drawing)
    else onSelectPly(at.move.ply - 1)
  }
  const go = (to: number) => {
    setIndex(to)
    setRevealed(false)
    searchId.current++
    setSearch(undefined)
    onTry(undefined)
    showMoment(steps[to]!, false)
  }
  const reveal = () => {
    setRevealed(true)
    searchId.current++
    setSearch(undefined)
    onTry(undefined)
    showMoment(step, true)
  }

  /** The board is the user's again, on the position before the move. */
  const look = () => {
    if (step.kind !== 'moment') return
    const fen = review.positions[step.move.ply - 1]?.fen
    if (!fen) return
    const { ply } = step.move
    const attempt: BoardTry = {
      fen,
      onMove: (move) => void judge(move, fen, ply, attempt),
    }
    setSearch({ status: 'looking' })
    onTry(attempt)
  }

  const judge = async (move: Move, fen: string, ply: number, attempt: BoardTry) => {
    const after = createGame(fen).play(move)
    if (!after?.move) return
    const played = after.move
    const lastMove: [SquareName, SquareName] = [move.from, move.to]
    const current = ++searchId.current
    onTry({ ...attempt, shown: { fen: after.fen, lastMove } })
    setSearch({ status: 'checking', san: played.san })
    try {
      const answer = await coach.tryMove({
        startFen: review.startFen,
        moves: review.moves.map((m) => m.uci),
        ply,
        tried: played.uci,
      })
      if (current !== searchId.current) return
      if (answer.verdict === 'right') {
        setRevealed(true)
        setSearch({ status: 'judged', answer })
        onTry(undefined)
        if (step.kind === 'moment') showMoment(step, true)
      } else {
        setSearch({ status: 'judged', answer })
      }
    } catch (error) {
      if (current !== searchId.current) return
      setSearch({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <section className="walkthrough" aria-label="Coach walkthrough">
      <p className="walkthrough-progress">
        {index + 1} of {steps.length}
      </p>
      <div className="walkthrough-step">
        {step.kind === 'summary' && (
          <>
            <h3>How it went</h3>
            <Markdown text={walkthrough.summary} />
            {side && <Phases review={review} side={side} />}
          </>
        )}
        {step.kind === 'opening' && (
          <>
            <h3>{step.opening.name}</h3>
            <Markdown text={step.opening.text} />
            {step.opening.record && (
              <p className="walkthrough-record">
                {step.opening.record.of} with {side}: {step.opening.record.wins} won,{' '}
                {step.opening.record.draws} drawn, {step.opening.record.losses} lost
              </p>
            )}
          </>
        )}
        {step.kind === 'moment' && (
          <>
            <h3>
              <ClassBadge cls={step.move.classification} /> {step.move.moveNumber}
              {step.move.color === 'white' ? '.' : '...'} {step.move.san}
            </h3>
            <Markdown text={step.moment.what} />
            {revealed && step.moment.better && (
              <div className="walkthrough-better">
                <h4>Better was {step.move.best?.san}</h4>
                <Markdown text={step.moment.better} />
              </div>
            )}
            {search && <SearchStatus search={search} />}
            {!revealed && step.moment.better && (
              <div className="walkthrough-actions">
                {wentWrong(step.move) && search?.status !== 'looking' && (
                  <button
                    type="button"
                    className="walkthrough-find"
                    disabled={search?.status === 'checking'}
                    onClick={look}
                  >
                    {search ? 'Try again' : 'Find a better move'}
                  </button>
                )}
                <button type="button" disabled={search?.status === 'checking'} onClick={reveal}>
                  Show the better move
                </button>
              </div>
            )}
          </>
        )}
        {step.kind === 'focus' && (
          <>
            <h3>What to work on</h3>
            <Markdown text={walkthrough.focus} />
          </>
        )}
      </div>

      <div className="walkthrough-nav">
        <button type="button" disabled={index === 0} onClick={() => go(index - 1)}>
          Back
        </button>
        <button type="button" onClick={onAsk}>
          Ask about this
        </button>
        {index < steps.length - 1 ? (
          <button type="button" className="walkthrough-next" onClick={() => go(index + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="walkthrough-next" onClick={onDone}>
            Done
          </button>
        )}
      </div>
      <p className="walkthrough-meta">
        {walkthrough.agent}
        {' · '}
        <button type="button" disabled={rewriting} onClick={onRewrite}>
          {rewriting ? 'Rewriting…' : 'Write it again'}
        </button>
        {' · '}
        <button type="button" onClick={onDone}>
          Close
        </button>
      </p>
    </section>
  )
}

/** What the coach says while the user looks for the move, and to each try. */
function SearchStatus({ search }: { search: Search }) {
  switch (search.status) {
    case 'looking':
      return <p className="walkthrough-search">Your move: play something better on the board.</p>
    case 'checking':
      return <p className="walkthrough-search">Checking {search.san}…</p>
    case 'failed':
      return (
        <p className="message message-error" role="alert">
          {search.message}
        </p>
      )
    case 'judged': {
      const { verdict, san, comment } = search.answer
      if (verdict === 'right') {
        return <p className="walkthrough-search walkthrough-right">Yes, {san} works!</p>
      }
      if (verdict === 'played') {
        return <p className="walkthrough-search">That's the move you played in the game.</p>
      }
      if (verdict === 'close') {
        return (
          <p className="walkthrough-search">{san} is decent, but there's something stronger.</p>
        )
      }
      return (
        <div className="walkthrough-search">
          <p>{san} isn't it.</p>
          {comment && <Markdown text={comment} />}
        </div>
      )
    }
  }
}

const PHASES = [
  ['opening', 'Opening'],
  ['middlegame', 'Middlegame'],
  ['endgame', 'Endgame'],
] as const

/** The user's accuracy in each phase they reached. */
function Phases({ review, side }: { review: GameReview; side: Color }) {
  const phases = phaseAccuracy(review, side)
  return (
    <dl className="walkthrough-phases">
      {PHASES.map(([phase, label]) =>
        phases[phase] === undefined ? null : (
          <div key={phase}>
            <dt>{label}</dt>
            <dd>{phases[phase]}</dd>
          </div>
        ),
      )}
    </dl>
  )
}
