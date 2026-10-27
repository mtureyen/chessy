import type { AnalysisSnapshot } from '@chessy/analysis'
import { useEffect, useState } from 'react'
import { useServices } from '@/app/servicesContext'

export type EngineStatus = 'off' | 'starting' | 'running' | 'done' | 'error'

export interface EngineState {
  status: EngineStatus
  /** Latest result for the current position (never one for a previous position). */
  snapshot?: AnalysisSnapshot
  engineName?: string
  error?: string
}

export interface EngineOptions {
  enabled: boolean
  multiPv: number
  maxDepth: number
}

/** Analyses `fen` while enabled; restarts on every position or option change. */
export function useEngineAnalysis(
  fen: string,
  { enabled, multiPv, maxDepth }: EngineOptions,
): EngineState {
  const { engine } = useServices()
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot>()
  const [engineName, setEngineName] = useState<string>()

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    engine.init().then(
      (info) => !cancelled && setEngineName(info.name),
      () => {}, // load failures surface through the analysis result
    )
    return () => {
      cancelled = true
    }
  }, [engine, enabled])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let frame = 0
    let pending: AnalysisSnapshot | undefined
    const flush = () => {
      frame = 0
      if (!cancelled && pending) setSnapshot(pending)
    }
    // Stockfish reports hundreds of times per second; render at most once per frame.
    const handle = engine.analyze({ fen, multiPv, depth: maxDepth }, (update) => {
      pending = update
      if (update.end) flush()
      else if (!frame) frame = requestAnimationFrame(flush)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      handle.stop()
    }
  }, [engine, fen, enabled, multiPv, maxDepth])

  if (!enabled) return engineName ? { status: 'off', engineName } : { status: 'off' }
  const current = snapshot?.fen === fen ? snapshot : undefined
  const base = engineName ? { engineName } : {}
  if (!current) return { ...base, status: 'starting' }
  if (current.end === 'error')
    return { ...base, status: 'error', snapshot: current, error: current.error ?? 'Engine failed' }
  return { ...base, status: current.end ? 'done' : 'running', snapshot: current }
}
