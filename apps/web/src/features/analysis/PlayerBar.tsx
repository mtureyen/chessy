import type { Color } from '@chessy/chess'
import { formatClock } from '@/shared/game/clock'
import './PlayerBar.css'

export interface PlayerBarProps {
  color: Color
  name: string
  rating?: string
  title?: string
  clock?: number
  /** The side to move; its clock is highlighted. */
  active: boolean
}

export function PlayerBar({ color, name, rating, title, clock, active }: PlayerBarProps) {
  return (
    <div className={`player-bar player-bar-${color}`} data-testid={`player-${color}`}>
      <span className={`player-dot player-dot-${color}`} aria-hidden />
      {title && <span className="player-title">{title}</span>}
      <span className="player-name">{name}</span>
      {rating && <span className="player-rating">{rating}</span>}
      {clock !== undefined && (
        <span
          className={`player-clock${active ? ' player-clock-active' : ''}`}
          aria-label={`${color} clock`}
        >
          {formatClock(clock)}
        </span>
      )}
    </div>
  )
}
