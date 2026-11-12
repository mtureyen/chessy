import type { Color, Material } from '@pawnia/chess'
import { TakenPieces } from '@/shared/board/TakenPieces'
import { formatClock } from './clock'
import './PlayerBar.css'

export interface PlayerBarProps {
  color: Color
  name: string
  rating?: string
  title?: string
  clock?: number
  /** The side to move; its clock is highlighted. */
  active: boolean
  /** The material on the board: this side's taken pieces and lead are shown. */
  material?: Material
}

/** A player above or below the board: name, rating, what they have taken, clock. */
export function PlayerBar({ color, name, rating, title, clock, active, material }: PlayerBarProps) {
  return (
    <div className={`player-bar player-bar-${color}`} data-testid={`player-${color}`}>
      <span className={`player-dot player-dot-${color}`} aria-hidden />
      {title && <span className="player-title">{title}</span>}
      <span className="player-name">{name}</span>
      {rating && <span className="player-rating">{rating}</span>}
      {material && <TakenPieces material={material} color={color} />}
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
