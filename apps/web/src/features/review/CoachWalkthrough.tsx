import type { GameReview } from '@chessy/analysis'
import type { Color } from '@chessy/chess'
import type { CoachWalkthroughBody } from '@chessy/contracts'
import { phaseAccuracy } from '@chessy/history'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { Markdown } from '@/features/coach/Markdown'
import type { PlacedDrawing } from '@/features/coach/useCoachChat'
import { ClassBadge } from './ClassBadge'
import { momentDrawing, walkthroughSteps, type WalkthroughStep } from './walkthrough'

export interface CoachWalkthroughProps {
  review: GameReview
  /** The colour the user played, if they played the game. */
  side: Color | undefined
  onSelectPly: (ply: number) => void
  onShow: (drawing: PlacedDrawing) => void
  /** Goes on with the coach in its chat, on the position on the board. */
  onAsk: () => void
  /** The walkthrough opens: the board turns to the user's side. */
  onOpen: () => void
}

/** The coach going through a reviewed game, one stop at a time, written once and kept. */
export function CoachWalkthrough(props: CoachWalkthroughProps) {
  const { review, side, onOpen } = props
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
        onClose={() => setOpen(false)}
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
  walkthrough,
  rewriting,
  onRewrite,
  onClose,
}: CoachWalkthroughProps & {
  walkthrough: CoachWalkthroughBody
  rewriting: boolean
  onRewrite: () => void
  onClose: () => void
}) {
  const steps = walkthroughSteps(walkthrough, review)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
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
    showMoment(steps[to]!, false)
  }
  const reveal = () => {
    setRevealed(true)
    showMoment(step, true)
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
            {!revealed && step.moment.better && (
              <button type="button" onClick={reveal}>
                Show the better move
              </button>
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
          <button type="button" className="walkthrough-next" onClick={onClose}>
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
        <button type="button" onClick={onClose}>
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
