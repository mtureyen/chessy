import type { RepertoireLineBody } from '@pawnia/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { lineText } from '@/features/stats/format'
import { guideNotes } from '../library/learnLine'
import { LineTrainer } from '../library/LineTrainer'
import { TrainingTabs } from '../TrainingTabs'
import '@/features/stats/Stats.css'
import '../Training.css'
import '../library/Library.css'

const NO_NOTES = new Map<number, string>()

/**
 * One line of a review, played from memory. Where a move is missed, the coach's note from the
 * opening's guide says what it is for (lines from the library, once their guide is written).
 */
function ReviewLine({
  line,
  onExit,
  onDone,
  onNext,
}: {
  line: RepertoireLineBody
  onExit: () => void
  onDone: (passed: boolean) => void
  onNext: () => void
}) {
  const { openingLibrary } = useServices()
  const guide = useQuery({
    queryKey: ['opening-library', line.openingId, 'guide'],
    queryFn: () => openingLibrary.guide(line.openingId!),
    enabled: line.openingId !== undefined,
  })
  const notes = useMemo(
    () => (guide.data ? guideNotes(line.moves, guide.data.moves) : NO_NOTES),
    [guide.data, line.moves],
  )
  return (
    <LineTrainer
      line={line.moves}
      side={line.side}
      title={line.title}
      notes={notes}
      start="play"
      exitLabel="Stop the review"
      onExit={onExit}
      onDone={({ firstTry, moves }) => onDone(firstTry === moves)}
      onNext={onNext}
    />
  )
}

/** /training/repertoire: the lines the user keeps, reviewed with growing gaps. */
export function RepertoirePage() {
  const { repertoire } = useServices()
  const client = useQueryClient()
  const lines = useQuery({ queryKey: ['repertoire'], queryFn: () => repertoire.list() })
  /** The lines of the review going on, and which one is on the board. */
  const [session, setSession] = useState<{ lines: RepertoireLineBody[]; at: number }>()
  const [results, setResults] = useState<boolean[]>([])
  const remove = useMutation({
    mutationFn: (id: string) => repertoire.remove(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['repertoire'] }),
  })

  const review = (chosen: RepertoireLineBody[]) => {
    setResults([])
    setSession({ lines: chosen, at: 0 })
  }
  const finish = () => {
    setSession(undefined)
    void client.invalidateQueries({ queryKey: ['repertoire'] })
  }

  if (session) {
    const line = session.lines[session.at]
    if (!line) {
      const passed = results.filter(Boolean).length
      return (
        <div className="stats-page library-page">
          <TrainingTabs />
          <section className="stats-section" aria-label="Review done">
            <h2>Review done</h2>
            <p role="status">
              {passed} of {results.length} {results.length === 1 ? 'line' : 'lines'} without a
              mistake. Those come back later; the others tomorrow.
            </p>
            <button type="button" className="library-learn repertoire-start" onClick={finish}>
              Back to my repertoire
            </button>
          </section>
        </div>
      )
    }
    return (
      <div className="stats-page library-page">
        <TrainingTabs />
        <p className="stats-note">
          Review: line {session.at + 1} of {session.lines.length}
        </p>
        <ReviewLine
          key={line.id}
          line={line}
          onExit={finish}
          onDone={(passed) => {
            setResults((r) => [...r, passed])
            void repertoire.review(line.id, passed)
          }}
          onNext={() => setSession((s) => s && { ...s, at: s.at + 1 })}
        />
      </div>
    )
  }

  const all = lines.data ?? []
  const due = all.filter((l) => l.due)
  return (
    <div className="stats-page library-page">
      <TrainingTabs />
      <div className="library-intro">
        <h1>My repertoire</h1>
        <p className="stats-note">
          The lines you keep. Play one through without a mistake and it comes back later (after 1,
          3, 7, 14, 30, then 60 days); a mistake brings it back tomorrow. Add lines from the{' '}
          <Link to="/training/library" search={{}}>
            opening library
          </Link>
          ; positions you miss when practising your openings come here by themselves.
        </p>
      </div>
      {lines.isPending && <p className="stats-note">Opening your repertoire…</p>}
      {lines.isError && (
        <p className="message message-error" role="alert">
          {lines.error.message}
        </p>
      )}
      {lines.data && (
        <>
          <p role="status">
            {due.length === 0
              ? all.length === 0
                ? 'No lines yet.'
                : 'Nothing due right now.'
              : `${due.length} ${due.length === 1 ? 'line' : 'lines'} to review.`}
          </p>
          {due.length > 0 && (
            <button
              type="button"
              className="library-learn repertoire-start"
              onClick={() => review(due)}
            >
              Review {due.length === 1 ? 'it' : `all ${due.length}`}
            </button>
          )}
          {(['white', 'black'] as const).map((side) => {
            const mine = all.filter((l) => l.side === side)
            if (mine.length === 0) return null
            return (
              <section
                key={side}
                className="stats-section"
                aria-label={side === 'white' ? 'With White' : 'With Black'}
              >
                <h2>With {side === 'white' ? 'White' : 'Black'}</h2>
                <ul className="library-lines repertoire-lines">
                  {mine.map((line) => (
                    <li key={line.id} className="repertoire-line">
                      <span className="library-line-name">
                        {line.title}
                        {line.source === 'practice' && (
                          <span className="library-chip library-chip-trap">missed in practice</span>
                        )}
                      </span>
                      <span className="library-card-line">{lineText(line.moves)}</span>
                      <span className={line.due ? 'repertoire-due' : 'stats-note'}>
                        {line.due
                          ? 'Due now'
                          : `In ${line.inDays} ${line.inDays === 1 ? 'day' : 'days'}`}
                      </span>
                      <span className="repertoire-actions">
                        <button type="button" onClick={() => review([line])}>
                          Review
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${line.title}`}
                          onClick={() => remove.mutate(line.id)}
                        >
                          Remove
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
