import { EvaluationCancelledError, type GameReview, type ReviewInput } from '@chessy/analysis'
import type { MoveNode } from '@chessy/chess'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReviewEngine } from '@/app/services'
import { useServices } from '@/app/servicesContext'
import { fitsMainline, reviewLine } from './mapping'
import { storedReviewQuery } from './storedReview'

export type ReviewState =
  | { status: 'idle' }
  /** Waiting to hear whether the server keeps a review of the main line. */
  | { status: 'checking' }
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; review: GameReview }
  | { status: 'error'; message: string }

const IDLE: ReviewState = { status: 'idle' }
const CHECKING: ReviewState = { status: 'checking' }

/**
 * The review of the current main line: the one the server keeps of it, or one run here. Each run
 * remembers the game (root) it belongs to, so loading another game forgets it right away; the
 * running review is cancelled.
 */
export function useGameReview(root: MoveNode, ratings?: ReviewInput['ratings']) {
  const { review: service } = useServices()
  const [entry, setEntry] = useState<{ root: MoveNode; state: ReviewState }>({ root, state: IDLE })
  const running = useRef<AbortController | null>(null)
  const line = reviewLine(root)
  const stored = useQuery({ ...storedReviewQuery(service, line), enabled: line.moves.length > 0 })
  const [found, setFound] = useState<{ root: MoveNode; review: GameReview }>()
  if (stored.data && (found?.root !== root || found.review !== stored.data)) {
    setFound({ root, review: stored.data })
  }

  useEffect(() => () => running.current?.abort(), [root])

  const start = useCallback(
    (nodes: number, engine: ReviewEngine) => {
      running.current?.abort()
      const controller = new AbortController()
      running.current = controller
      const set = (state: ReviewState) => !controller.signal.aborted && setEntry({ root, state })
      const { moves } = reviewLine(root)
      set({ status: 'running', done: 0, total: moves.length + 1 })
      service
        .run(
          { startFen: root.fen, moves, ...(ratings && { ratings }) },
          {
            engine,
            nodes,
            signal: controller.signal,
            onProgress: (done, total) => set({ status: 'running', done, total }),
          },
        )
        .then((review) => set({ status: 'done', review }))
        .catch((error: unknown) => {
          if (error instanceof EvaluationCancelledError) return
          set({ status: 'error', message: error instanceof Error ? error.message : String(error) })
        })
    },
    [root, ratings, service],
  )

  const cancel = useCallback(() => {
    running.current?.abort()
    running.current = null
    setEntry({ root, state: IDLE })
  }, [root])

  const own = entry.root === root ? entry.state : IDLE
  // A finished run gives way when it is of another line and the server has one of the main line.
  const outdated =
    own.status === 'done' &&
    stored.data &&
    !(fitsMainline(root, own.review) && own.review.moves.length === line.moves.length)
  if (own.status !== 'idle' && !outdated) return { state: own, start, cancel }

  // Moves played on from the end of a stored review's line leave it as true as it was.
  const kept = found?.root === root && fitsMainline(root, found.review) ? found.review : undefined
  const review = stored.data ?? kept
  const state: ReviewState = review
    ? { status: 'done', review }
    : stored.isLoading
      ? CHECKING
      : IDLE
  return { state, start, cancel }
}
