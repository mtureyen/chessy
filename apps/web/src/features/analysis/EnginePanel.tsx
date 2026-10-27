import { formatScore, toSanLine, type EngineLine } from '@chessy/analysis'
import { Fragment, useMemo } from 'react'
import type { EngineState } from './useEngineAnalysis'
import './EnginePanel.css'

const SHOWN_MOVES = 12
const MULTI_PV_OPTIONS = [1, 2, 3, 4, 5]

interface EnginePanelProps {
  fen: string
  state: EngineState
  enabled: boolean
  gameOver: boolean
  multiPv: number
  maxDepth: number
  onToggle: () => void
  onMultiPvChange: (multiPv: number) => void
  /** Plays the line's moves up to and including `index`. */
  onPlayLine: (pv: string[], index: number) => void
}

export function EnginePanel(props: EnginePanelProps) {
  const { fen, state, enabled, gameOver, multiPv, maxDepth } = props
  const lines = state.snapshot?.lines ?? []
  const best = lines[0]

  return (
    <section className="engine" aria-label="Engine analysis">
      <header className="engine-header">
        <label className="engine-switch" title="Engine on/off (L)">
          <input type="checkbox" checked={enabled} onChange={props.onToggle} aria-label="Engine" />
          <span className="engine-switch-track" />
        </label>
        <div className="engine-eval" data-testid="engine-eval">
          {enabled && best ? formatScore(best.score) : '–'}
        </div>
        <div className="engine-meta">
          <div className="engine-name">{state.engineName ?? 'Stockfish'}</div>
          <div className="engine-status" data-testid="engine-status">
            {statusText(state, enabled, gameOver, maxDepth)}
          </div>
        </div>
        <select
          className="engine-multipv"
          value={multiPv}
          onChange={(e) => props.onMultiPvChange(Number(e.target.value))}
          aria-label="Number of lines"
          title="Number of lines"
        >
          {MULTI_PV_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'line' : 'lines'}
            </option>
          ))}
        </select>
      </header>

      {enabled && !gameOver && (
        <ol className="engine-lines">
          {lines.map((line) => (
            <EngineLineRow key={line.rank} fen={fen} line={line} onPlay={props.onPlayLine} />
          ))}
        </ol>
      )}
    </section>
  )
}

function EngineLineRow({
  fen,
  line,
  onPlay,
}: {
  fen: string
  line: EngineLine
  onPlay: (pv: string[], index: number) => void
}) {
  const moves = useMemo(() => toSanLine(fen, line.pv, SHOWN_MOVES), [fen, line.pv])
  return (
    <li className="engine-line">
      <span className="engine-line-score">{formatScore(line.score)}</span>
      <span className="engine-line-moves">
        {moves.map((move, i) => (
          <Fragment key={i}>
            {i > 0 && ' '}
            <button type="button" className="engine-line-move" onClick={() => onPlay(line.pv, i)}>
              {move.color === 'white'
                ? `${move.moveNumber}. `
                : i === 0
                  ? `${move.moveNumber}... `
                  : ''}
              {move.san}
            </button>
          </Fragment>
        ))}
      </span>
    </li>
  )
}

function statusText(
  state: EngineState,
  enabled: boolean,
  gameOver: boolean,
  maxDepth: number,
): string {
  if (!enabled) return 'Off'
  if (gameOver) return 'Game over'
  switch (state.status) {
    case 'starting':
      return state.engineName ? 'Starting…' : 'Loading engine…'
    case 'error':
      return `Error: ${state.error}`
    case 'running':
    case 'done':
      return `Depth ${state.snapshot?.depth ?? 0}/${maxDepth}${state.status === 'done' ? ' ✓' : ''}`
    case 'off':
      return 'Off'
  }
}
