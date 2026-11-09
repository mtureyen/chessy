import type { MoveNode } from '@pawnia/chess'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { ReviewEngine } from '@/app/services'
import { useServices } from '@/app/servicesContext'
import { reviewLine } from './mapping'
import { presetNodes } from './presets'
import { storedReviewQuery } from './storedReview'

/**
 * Starts a Standard review of `root` once, with the same engine the review panel would pick
 * (the server's when it has one), unless the server keeps a review of it already. Only for the
 * game the page opened with, not one loaded later.
 */
export function useAutoReview(
  enabled: boolean,
  root: MoveNode,
  start: (nodes: number, engine: ReviewEngine) => void,
) {
  const { review } = useServices()
  const client = useQueryClient()
  const [openedWith] = useState(root)
  const server = useQuery({
    queryKey: ['server-engine'],
    queryFn: review.serverEngine,
    staleTime: 30_000,
    enabled,
  })
  const ready = enabled && root === openedWith && server.isFetched
  const engine: ReviewEngine = server.data ? 'server' : 'browser'
  const started = useRef(false)

  useEffect(() => {
    if (!ready || started.current) return
    started.current = true
    let left = false
    void client.fetchQuery(storedReviewQuery(review, reviewLine(root))).then((stored) => {
      if (!stored && !left) start(presetNodes('standard'), engine)
    })
    // StrictMode unmounts once in development, which cancels the review: allow a restart then.
    return () => {
      left = true
      started.current = false
    }
  }, [ready, engine, start, client, review, root])
}
