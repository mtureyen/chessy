import { useState } from 'react'
import { percent, type Tally } from './format'

/** Wins, draws and losses as one bar: green, light grey, red, with the counts in the tooltip. */
export function WdlBar({ tally }: { tally: Tally }) {
  const finished = tally.wins + tally.draws + tally.losses
  const parts = [
    { key: 'win', n: tally.wins, label: 'won' },
    { key: 'draw', n: tally.draws, label: 'drawn' },
    { key: 'loss', n: tally.losses, label: 'lost' },
  ].filter((part) => part.n > 0)
  const text = parts.map((p) => `${p.n} ${p.label}`).join(' · ') || 'no finished games'
  return (
    <span className="wdl-bar" role="img" aria-label={text} title={text}>
      {parts.map((part) => (
        <span
          key={part.key}
          className={`wdl-${part.key}`}
          style={{ flexGrow: part.n, flexBasis: `${percent(part.n, finished)}%` }}
        />
      ))}
    </span>
  )
}

/** A horizontal bar for a share of something, e.g. games of one kind. */
export function ShareBar({ share, tone }: { share: number; tone: 'win' | 'draw' | 'loss' }) {
  return (
    <span className="share-bar" aria-hidden>
      <span className={`wdl-${tone}`} style={{ width: `${Math.max(share, share > 0 ? 2 : 0)}%` }} />
    </span>
  )
}

export interface LinePoint {
  at: string
  value: number
}

const WIDTH = 600
const HEIGHT = 140

/**
 * One series over time, a point per game (evenly spaced: games, not days). Hovering shows the
 * nearest game's value and date.
 */
export function LineChart({
  points,
  label,
  format = String,
}: {
  points: readonly LinePoint[]
  label: string
  format?: (value: number) => string
}) {
  const [hover, setHover] = useState<number>()
  if (points.length === 0) return null
  const values = points.map((p) => p.value)
  const [low, high] = [Math.min(...values), Math.max(...values)]
  const pad = Math.max((high - low) * 0.1, 5)
  const [min, max] = [low - pad, high + pad]
  const last = Math.max(1, points.length - 1)
  const x = (i: number) => (points.length === 1 ? 0.5 : i / last)
  const y = (value: number) => 1 - (value - min) / (max - min)
  const line = points.map((p, i) => `${x(i) * WIDTH},${y(p.value) * HEIGHT}`).join(' ')
  const shown = hover === undefined ? undefined : points[hover]
  const day = (at: string) => new Date(at).toLocaleDateString(undefined, { dateStyle: 'medium' })

  return (
    <figure className="line-chart">
      <div
        className="line-chart-plot"
        role="img"
        aria-label={`${label}: from ${format(values[0]!)} to ${format(values.at(-1)!)}, highest ${format(high)}, lowest ${format(low)}`}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          setHover(Math.round(((e.clientX - box.left) / box.width) * last))
        }}
        onPointerLeave={() => setHover(undefined)}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden>
          <line
            className="line-chart-grid"
            x1="0"
            x2={WIDTH}
            y1={y(high) * HEIGHT}
            y2={y(high) * HEIGHT}
          />
          <line
            className="line-chart-grid"
            x1="0"
            x2={WIDTH}
            y1={y(low) * HEIGHT}
            y2={y(low) * HEIGHT}
          />
          {points.length > 1 && <polyline className="line-chart-line" points={line} />}
        </svg>
        <span className="line-chart-axis line-chart-high" style={{ top: `${y(high) * 100}%` }}>
          {format(high)}
        </span>
        <span className="line-chart-axis line-chart-low" style={{ top: `${y(low) * 100}%` }}>
          {format(low)}
        </span>
        {(points.length === 1 || shown) && (
          <span
            className="line-chart-dot"
            style={{
              left: `${x(hover ?? 0) * 100}%`,
              top: `${y((shown ?? points[0]!).value) * 100}%`,
            }}
          />
        )}
        {shown && (
          <>
            <span className="line-chart-cursor" style={{ left: `${x(hover!) * 100}%` }} />
            <span
              className="line-chart-tooltip"
              role="status"
              style={{ left: `${x(hover!) * 100}%` }}
              data-side={x(hover!) > 0.7 ? 'left' : 'right'}
            >
              <strong>{format(shown.value)}</strong> {day(shown.at)}
            </span>
          </>
        )}
      </div>
      <figcaption className="line-chart-dates">
        <span>{day(points[0]!.at)}</span>
        <span>{day(points.at(-1)!.at)}</span>
      </figcaption>
    </figure>
  )
}
