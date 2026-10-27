import { formatScore, whiteWinChance, type Score } from '@chessy/analysis'
import type { Color, GameStatus } from '@chessy/chess'
import './EvalBar.css'

interface EvalBarProps {
  score: Score | undefined
  status: GameStatus
  orientation: Color
}

/** Vertical bar showing White's winning chances; White's side is at the bottom unless flipped. */
export function EvalBar({ score, status, orientation }: EvalBarProps) {
  const { white, label } = barState(score, status)
  const whiteLeads = white >= 50
  return (
    <div
      className={`eval-bar${orientation === 'black' ? ' eval-bar-flipped' : ''}`}
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(white)}
      aria-valuetext={label}
    >
      <div className="eval-bar-white" style={{ height: `${white}%` }} />
      <div className="eval-bar-mid" />
      {label && (
        <span
          className={`eval-bar-label ${whiteLeads ? 'eval-bar-label-white' : 'eval-bar-label-black'}`}
        >
          {label}
        </span>
      )}
    </div>
  )
}

function barState(score: Score | undefined, status: GameStatus): { white: number; label: string } {
  if (status.kind === 'checkmate')
    return {
      white: status.winner === 'white' ? 100 : 0,
      label: status.winner === 'white' ? '1-0' : '0-1',
    }
  if (status.kind === 'draw') return { white: 50, label: '½' }
  if (!score) return { white: 50, label: '' }
  return {
    white: whiteWinChance(score),
    label: formatScore(score).replace(/^[+-]/, '').replace('#-', '#'),
  }
}
