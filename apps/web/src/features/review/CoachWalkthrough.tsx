import type { GameReview } from '@pawnia/analysis'
import type { Color } from '@pawnia/chess'
import type { CoachWalkthroughBody } from '@pawnia/contracts'
import { phaseAccuracy } from '@pawnia/history'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { Markdown } from '@/features/coach/Markdown'
import type { PlacedDrawing } from '@/features/coach/useCoachChat'
import { ClassBadge } from './ClassBadge'
import { SearchStatus } from './SearchStatus'
import { useMoveTry } from './useMoveTry'
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
  /** Whether `side` is known yet: it decides what the walkthrough is about. */
  ready: boolean
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
        disabled={load.isPending || !props.ready}
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
  const steps = walkthroughSteps(walkthrough, review)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const step = steps[Math.min(index, steps.length - 1)]!
  const {
    search,
    look: lookFor,
    stop,
  } = useMoveTry({
    line: { startFen: review.startFen, moves: review.moves.map((m) => m.uci) },
    onBoard: onTry,
    onRight: () => {
      setRevealed(true)
      showMoment(step, true)
    },
  })

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
    stop()
    showMoment(steps[to]!, false)
  }
  const reveal = () => {
    setRevealed(true)
    stop()
    showMoment(step, true)
  }

  /** The board is the user's again, on the position before the move. */
  const look = () => {
    if (step.kind !== 'moment') return
    const fen = review.positions[step.move.ply - 1]?.fen
    if (fen) lookFor(fen, step.move.ply)
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
