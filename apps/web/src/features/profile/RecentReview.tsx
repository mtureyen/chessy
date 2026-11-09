import type { ReviewQueueBody, StartReviewQueueBody } from '@pawnia/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useServices } from '@/app/servicesContext'

const COUNTS = ['30', '50', '100'] as const
const SPEEDS = ['rapid', 'blitz', 'bullet', 'classical'] as const
const MAX_GAMES = 500

/** Reviews the user's last games on the server, so the coach sees how they play now. */
export function RecentReview() {
  const { reviewQueue } = useServices()
  const client = useQueryClient()
  const [choice, setChoice] = useState<string>(COUNTS[0])
  const [custom, setCustom] = useState('30')
  const [speed, setSpeed] = useState<StartReviewQueueBody['speed'] | ''>('')

  const queue = useQuery({
    queryKey: ['review-queue'],
    queryFn: () => reviewQueue.status(),
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 1000 : false),
  })
  const act = useMutation({
    mutationFn: (action: () => Promise<ReviewQueueBody>) => action(),
    onSuccess: (state) => client.setQueryData(['review-queue'], state),
  })

  const state = queue.data
  const running = state?.status === 'running'
  const count = Number(choice === 'custom' ? custom : choice)
  const validCount = Number.isInteger(count) && count >= 1 && count <= MAX_GAMES

  return (
    <section className="recent-review" aria-label="Review recent games">
      <h2>Recent games</h2>
      <p className="profile-intro">
        Review your latest games so the coach can see how you play now.
      </p>
      {state && <Progress state={state} />}
      {act.error && (
        <p className="message message-error" role="alert">
          {act.error.message}
        </p>
      )}
      {running ? (
        <button
          type="button"
          className="profile-edit"
          disabled={act.isPending}
          onClick={() => act.mutate(() => reviewQueue.pause())}
        >
          Pause
        </button>
      ) : (
        <form
          className="recent-review-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (validCount) {
              act.mutate(() => reviewQueue.start({ count, ...(speed && { speed }) }))
            }
          }}
        >
          <label>
            Last
            <select
              aria-label="How many games"
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
            >
              {COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="custom">Other…</option>
            </select>
          </label>
          {choice === 'custom' && (
            <input
              aria-label="Number of games"
              type="number"
              min={1}
              max={MAX_GAMES}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          )}
          <select
            aria-label="Speed"
            value={speed}
            onChange={(e) => setSpeed(e.target.value as typeof speed)}
          >
            <option value="">all games</option>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s} games
              </option>
            ))}
          </select>
          <button type="submit" className="profile-save" disabled={!validCount || act.isPending}>
            Review
          </button>
          {state?.status === 'paused' && (
            <button
              type="button"
              className="profile-edit"
              disabled={act.isPending}
              onClick={() => act.mutate(() => reviewQueue.resume())}
            >
              Resume
            </button>
          )}
        </form>
      )}
    </section>
  )
}

function Progress({ state }: { state: ReviewQueueBody }) {
  const { status, total, done, failed, reason } = state
  const skipped = failed > 0 ? ` ${failed} could not be reviewed.` : ''
  if (status === 'idle') return null
  if (status === 'failed') {
    return (
      <p className="message message-error" role="alert">
        The review stopped: {reason}
      </p>
    )
  }
  if (status === 'finished') {
    return (
      <p className="message message-info" role="status">
        {total === 0 ? 'No finished games to review.' : `${done} of ${total} games reviewed.`}
        {skipped}
      </p>
    )
  }
  return (
    <div className="import-progress" role="status">
      <div className="import-bar" aria-hidden>
        <div style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
      </div>
      <span>
        {status === 'paused' ? 'Paused' : 'Reviewing your games'} · {done} of {total}
        {skipped}
      </span>
    </div>
  )
}
