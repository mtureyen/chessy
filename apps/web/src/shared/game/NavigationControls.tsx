import type { GameState } from '@chessy/chess'
import type { GameView } from './useGame'
import './GamePanel.css'

interface NavigationControlsProps {
  view: GameView
  update: (change: (game: GameState) => unknown) => void
}

export function NavigationControls({ view, update }: NavigationControlsProps) {
  return (
    <div className="nav">
      <button
        type="button"
        title="Start (↑)"
        disabled={view.atStart}
        onClick={() => update((g) => g.toStart())}
      >
        ⏮
      </button>
      <button
        type="button"
        title="Back (←)"
        disabled={view.atStart}
        onClick={() => update((g) => g.back())}
      >
        ◀
      </button>
      <button
        type="button"
        title="Forward (→)"
        disabled={view.atEnd}
        onClick={() => update((g) => g.forward())}
      >
        ▶
      </button>
      <button
        type="button"
        title="End (↓)"
        disabled={view.atEnd}
        onClick={() => update((g) => g.toEnd())}
      >
        ⏭
      </button>
    </div>
  )
}
