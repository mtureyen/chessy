import type { GameState } from '@chessy/chess'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { GameView } from '@/shared/game/useGame'
import { findPosition, samePosition } from './situation'
import type { PlacedDrawing } from './useCoachChat'

/**
 * What the coach drew; the board shows it while it is on that position. `showDrawing` also takes
 * the board there, when that position is in the game.
 */
export function useCoachDrawing(
  view: GameView,
  update: (change: (game: GameState) => unknown) => void,
) {
  const [drawing, setDrawing] = useState<PlacedDrawing>()
  const latestRoot = useRef(view.root)
  useLayoutEffect(() => {
    latestRoot.current = view.root
  })
  const showDrawing = useCallback(
    (shown: PlacedDrawing) => {
      setDrawing(shown)
      const node = findPosition(latestRoot.current, shown.fen)
      if (node) update((g) => g.goTo(node))
    },
    [update],
  )
  const shownDrawing = drawing && samePosition(drawing.fen, view.fen) ? drawing : undefined
  return { shownDrawing, showDrawing }
}
