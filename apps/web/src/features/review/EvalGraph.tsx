import type { GameReview } from '@chessy/analysis'
import { CLASS_STYLES } from './classes'

const MARKED = new Set(['brilliant', 'great', 'miss', 'mistake', 'blunder'])

interface EvalGraphProps {
  review: GameReview
  /** Half-move of the position shown on the board (0 = start). */
  currentPly: number
  onSelectPly: (ply: number) => void
}

/** White's winning chances over the game; click to jump to a position. */
export function EvalGraph({ review, currentPly, onSelectPly }: EvalGraphProps) {
  const points = review.positions.map((p) => p.whiteWin)
  const last = Math.max(1, points.length - 1)
  const x = (i: number) => (i / last) * 100
  const line = points.map((w, i) => `${x(i)},${100 - w}`).join(' ')

  return (
    <div
      className="eval-graph"
      role="img"
      aria-label="Evaluation graph"
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect()
        onSelectPly(Math.round(((e.clientX - box.left) / box.width) * last))
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <polygon className="eval-graph-white" points={`0,100 ${line} 100,100`} />
        <line className="eval-graph-mid" x1="0" y1="50" x2="100" y2="50" />
        <line className="eval-graph-cursor" x1={x(currentPly)} y1="0" x2={x(currentPly)} y2="100" />
      </svg>
      {review.moves
        .filter((m) => MARKED.has(m.classification))
        .map((m) => (
          <span
            key={m.ply}
            className="eval-graph-marker"
            title={`${m.moveNumber}${m.color === 'white' ? '.' : '...'} ${m.san}: ${CLASS_STYLES[m.classification].label}`}
            style={{
              left: `${x(m.ply)}%`,
              top: `${100 - points[m.ply]!}%`,
              background: CLASS_STYLES[m.classification].color,
            }}
          />
        ))}
    </div>
  )
}
