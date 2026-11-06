import type { Color } from '@chessy/chess'
import type { CoachCommentBody } from '@chessy/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import { presetNodes } from '@/features/review/presets'
import type { GameView } from '@/shared/game/useGame'
import { commentFacts, judgedMoves } from './moveComment'

export interface MoveComment {
  /** The ply of the move it is about. */
  ply: number
  /** The move as written in a game, e.g. "12... Qxb7". */
  move: string
  verdict: CoachCommentBody['verdict']
  text: string
}

/** A review's own budget, so the review after the game reuses these evaluations. */
const NODES = presetNodes('standard')

/**
 * Short comments from the coach on the user's notable moves, newest first, while `enabled`.
 * Runs beside the game and never holds it up: one move at a time, moves played meanwhile are
 * skipped, and a comment that fails is simply not there. A takeback takes its comment along.
 */
export function useMoveComments({
  view,
  color,
  agent,
  rating,
  enabled,
}: {
  view: GameView
  color: Color
  agent: string | undefined
  rating: number | undefined
  enabled: boolean
}) {
  const { coach, review } = useServices()
  const [comments, setComments] = useState<MoveComment[]>([])
  const own = view.line.findLast((node) => node.move?.color === color)
  const ownPly = own?.ply ?? 0
  // Starts at the last move there is: a resumed game doesn't comment on what came before.
  const seenPly = useRef(ownPly)
  const running = useRef<AbortController | undefined>(undefined)

  const stop = useCallback(() => {
    running.current?.abort()
    running.current = undefined
  }, [])

  useEffect(() => {
    const previousPly = seenPly.current
    seenPly.current = ownPly
    if (ownPly < previousPly) {
      stop()
      setComments((list) => list.filter((comment) => comment.ply <= ownPly))
    }
    if (ownPly <= previousPly || !own?.move || !enabled || running.current) return

    const abort = new AbortController()
    running.current = abort
    const { moveNumber, san } = own.move
    const number = `${moveNumber}${color === 'white' ? '.' : '...'}`
    review
      .judge(
        { ...judgedMoves(own), ...(rating && { ratings: { [color]: rating } }) },
        { nodes: NODES, signal: abort.signal },
      )
      .then(async (judged) => {
        const facts = commentFacts(own, judged, rating)
        if (!facts) return
        const text = await coach.comment({ ...facts, ...(agent && { agent }) }, abort.signal)
        if (abort.signal.aborted) return
        const comment = { ply: ownPly, move: `${number} ${san}`, verdict: facts.verdict, text }
        setComments((list) => [comment, ...list])
      })
      .catch(() => undefined)
      .finally(() => {
        if (running.current === abort) running.current = undefined
      })
  }, [own, ownPly, color, agent, rating, enabled, coach, review, stop])

  useEffect(() => {
    if (!enabled) stop()
  }, [enabled, stop])

  useEffect(() => stop, [stop])

  return comments
}
