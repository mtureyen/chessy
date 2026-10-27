import type { GameState } from '@chessy/chess'
import { useEffect } from 'react'

/**
 * Arrow keys / Home / End navigate the game; `extra` adds page-specific keys (e.g. `f` to flip).
 * Ignored while typing in inputs.
 */
export function useGameKeyboard(
  update: (change: (game: GameState) => unknown) => void,
  extra: Record<string, () => void> = {},
) {
  useEffect(() => {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => update((g) => g.back()),
      ArrowRight: () => update((g) => g.forward()),
      ArrowUp: () => update((g) => g.toStart()),
      Home: () => update((g) => g.toStart()),
      ArrowDown: () => update((g) => g.toEnd()),
      End: () => update((g) => g.toEnd()),
      ...extra,
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
      const action = actions[e.key]
      if (action) {
        e.preventDefault()
        action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [update, extra])
}
