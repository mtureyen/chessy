import { keyMoments, type GameReview } from '@chessy/analysis'
import { useState, type ReactNode } from 'react'
import { ClassBadge } from './ClassBadge'
import { CLASS_STYLES, SUMMARY_ORDER } from './classes'
import { presetNodes, REVIEW_PRESETS, type ReviewPresetId } from './presets'
import type { ReviewState } from './useGameReview'
import './Review.css'

interface ReviewPanelProps {
  state: ReviewState
  moveCount: number
  onStart: (nodes: number) => void
  onCancel: () => void
  onSelectPly: (ply: number) => void
}

export function ReviewPanel({
  state,
  moveCount,
  onStart,
  onCancel,
  onSelectPly,
}: ReviewPanelProps) {
  const [preset, setPreset] = useState<ReviewPresetId>('standard')

  const startControls = (label: string) => (
    <div className="review-start">
      <select
        value={preset}
        onChange={(e) => setPreset(e.target.value as ReviewPresetId)}
        aria-label="Review quality"
      >
        {REVIEW_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} ({p.nodes >= 1e6 ? `${p.nodes / 1e6}M` : `${p.nodes / 1e3}k`} nodes)
          </option>
        ))}
      </select>
      <button
        type="button"
        className="review-start-button"
        disabled={moveCount === 0}
        onClick={() => onStart(presetNodes(preset))}
      >
        {label}
      </button>
    </div>
  )

  switch (state.status) {
    case 'idle':
      return (
        <div className="review">
          <p className="review-intro">
            {moveCount === 0
              ? 'Play or load a game to review it.'
              : `Stockfish checks all ${moveCount} moves: accuracy, mistakes and key moments.`}
          </p>
          {startControls('Start review')}
        </div>
      )
    case 'running':
      return (
        <div className="review">
          <div
            className="review-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={state.total}
            aria-valuenow={state.done}
          >
            <div style={{ width: `${(state.done / state.total) * 100}%` }} />
          </div>
          <p className="review-intro">
            Analysing position {state.done} of {state.total}…
          </p>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )
    case 'error':
      return (
        <div className="review">
          <p className="message message-error" role="alert">
            {state.message}
          </p>
          {startControls('Try again')}
        </div>
      )
    case 'done':
      return (
        <ReviewReport
          review={state.review}
          onSelectPly={onSelectPly}
          again={startControls('Review again')}
        />
      )
  }
}

function ReviewReport({
  review,
  onSelectPly,
  again,
}: {
  review: GameReview
  onSelectPly: (ply: number) => void
  again: ReactNode
}) {
  const moments = keyMoments(review)
  // "Forced" only appears when it happened; the others always, like on chess.com.
  const total = (cls: (typeof SUMMARY_ORDER)[number]) =>
    (review.counts.white[cls] ?? 0) + (review.counts.black[cls] ?? 0)
  const rows = SUMMARY_ORDER.filter((cls) => cls !== 'forced' || total(cls) > 0)
  return (
    <div className="review">
      <div className="review-accuracy">
        {(['white', 'black'] as const).map((color) => (
          <div key={color} className={`review-accuracy-${color}`} data-testid={`accuracy-${color}`}>
            <span className="review-accuracy-value">
              {review.accuracy[color]?.toFixed(1) ?? '–'}
            </span>
            <span className="review-accuracy-label">
              {color === 'white' ? 'White' : 'Black'} accuracy
            </span>
          </div>
        ))}
      </div>

      <table className="review-counts">
        <tbody>
          {rows.map((cls) => (
            <tr key={cls} data-testid={`count-${cls}`}>
              <td className="review-count">{review.counts.white[cls] ?? 0}</td>
              <td className="review-count-label">
                <ClassBadge cls={cls} /> {CLASS_STYLES[cls].label}
              </td>
              <td className="review-count">{review.counts.black[cls] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {moments.length > 0 && (
        <div className="review-moments">
          <h3>Key moments</h3>
          <ul>
            {moments.map((m) => (
              <li key={m.ply}>
                <button type="button" onClick={() => onSelectPly(m.ply)}>
                  <ClassBadge cls={m.classification} />
                  <span className="review-moment-move">
                    {m.moveNumber}
                    {m.color === 'white' ? '.' : '...'} {m.san}
                  </span>
                  <span className="review-moment-text">
                    {CLASS_STYLES[m.classification].label}
                    {m.best && m.best.uci !== m.uci ? ` · best was ${m.best.san}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="review-meta">
        {review.settings.engine} · {review.settings.nodes.toLocaleString()} nodes per position
      </p>
      {again}
    </div>
  )
}
