import { useSyncExternalStore } from 'react'
import { appearanceVariables, parseAppearance, type BoardAppearance } from './appearance'

const KEY = 'pawnia.board-appearance'

/**
 * The board appearance, kept in localStorage (synchronous, so the first paint already has the
 * right board) and applied as CSS variables on the document root, where every board reads them.
 */
let current = load()
const listeners = new Set<() => void>()

function load(): BoardAppearance {
  try {
    return parseAppearance(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return parseAppearance(null)
  }
}

/** Puts the current appearance on the page; called once at startup and on every change. */
export function applyBoardAppearance(): void {
  const style = document.documentElement.style
  for (const [name, value] of Object.entries(
    appearanceVariables(current, import.meta.env.BASE_URL),
  )) {
    style.setProperty(name, value)
  }
}

export function setBoardAppearance(change: Partial<BoardAppearance>): void {
  current = parseAppearance({ ...current, ...change })
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Storage blocked (private mode): the choice still holds until the page is reloaded.
  }
  applyBoardAppearance()
  for (const listener of listeners) listener()
}

export function useBoardAppearance(): BoardAppearance {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}
