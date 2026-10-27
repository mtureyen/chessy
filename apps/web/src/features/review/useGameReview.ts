import { ReviewCancelledError, type GameReview } from '@chessy/analysis'
import type { MoveNode } from '@chessy/chess'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { mainline } from './mapping'

export type ReviewState =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; review: GameReview }
  | { status: 'error'; message: string }

const IDLE: ReviewState = { status: 'idle' }

/**
 * Runs a review of the current main line. Each state remembers the game (root) it belongs to,
 * so loading another game shows "idle" right away; the running review is cancelled.
 */
export function useGameReview(root: MoveNode) {
  const { review: service } = useServices()
  const [entry, setEntry] = useState<{ root: MoveNode; state: ReviewState }>({ root, state: IDLE })
  const running = useRef<AbortController | null>(null)

  useEffect(() => () => running.current?.abort(), [root])

  const start = useCallback(
    (nodes: number) => {
      running.current?.abort()
      const controller = new AbortController()
      running.current = controller
      const set = (state: ReviewState) => !controller.signal.aborted && setEntry({ root, state })
      const moves = mainline(root).map((node) => node.move!.uci)
      set({ status: 'running', done: 0, total: moves.length + 1 })
      service
        .run(
          { startFen: root.fen, moves },
          {
            nodes,
            signal: controller.signal,
            onProgress: (done, total) => set({ status: 'running', done, total }),
          },
        )
        .then((review) => set({ status: 'done', review }))
        .catch((error: unknown) => {
          if (error instanceof ReviewCancelledError) return
          set({ status: 'error', message: error instanceof Error ? error.message : String(error) })
        })
    },
    [root, service],
  )

  const cancel = useCallback(() => {
    running.current?.abort()
    running.current = null
    setEntry({ root, state: IDLE })
  }, [root])

  return { state: entry.root === root ? entry.state : IDLE, start, cancel }
}
