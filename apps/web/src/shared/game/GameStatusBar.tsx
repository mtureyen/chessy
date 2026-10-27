import type { Color, GameStatus } from '@chessy/chess'
import './GamePanel.css'

const DRAW_REASONS: Record<Extract<GameStatus, { kind: 'draw' }>['reason'], string> = {
  stalemate: 'stalemate',
  'insufficient-material': 'insufficient material',
  'threefold-repetition': 'threefold repetition',
  'fifty-move-rule': 'fifty-move rule',
}

export function GameStatusBar({
  status,
  turn,
  check,
}: {
  status: GameStatus
  turn: Color
  check: boolean
}) {
  return <div className={`status status-${status.kind}`}>{describeStatus(status, turn, check)}</div>
}

function describeStatus(status: GameStatus, turn: Color, check: boolean): string {
  switch (status.kind) {
    case 'checkmate':
      return `Checkmate · ${capitalize(status.winner)} wins`
    case 'draw':
      return `Draw · ${DRAW_REASONS[status.reason]}`
    case 'ongoing':
      return `${capitalize(turn)} to move${check ? ' · check' : ''}`
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
