import {
  materialOf,
  type Color,
  type Material,
  type MoveNode,
  type PgnHeaders,
} from '@pawnia/chess'
import { useMemo } from 'react'
import { clockAt } from './clock'
import type { PlayerBarProps } from './PlayerBar'
import type { GameView } from './useGame'

/**
 * What each side has taken on the way to `node`, and who is ahead. `then` is one more position
 * after it that is on the board without being in the game (a move being tried out).
 */
export function useMaterial(node: MoveNode, then?: string): Material {
  return useMemo(() => {
    const positions = then ? [then] : []
    for (let n: MoveNode | undefined = node; n; n = n.parent) positions.unshift(n.fen)
    return materialOf(positions)
  }, [node, then])
}

/**
 * The bars above and below a board: names, ratings and titles from the PGN headers ("White" and
 * "Black" when the game names nobody), the clocks in the tree, the pieces taken.
 */
export function playerBars(
  headers: PgnHeaders,
  view: GameView,
  material: Material,
): Record<Color, PlayerBarProps> {
  const known = (tag: string | undefined) => (tag && tag !== '?' ? tag : undefined) // PGN uses "?" for unknown
  const player = (color: Color, tag: 'White' | 'Black'): PlayerBarProps => ({
    color,
    name: known(headers[tag]) ?? tag,
    rating: known(headers[`${tag}Elo`]),
    title: known(headers[`${tag}Title`]),
    clock: clockAt(view.current, color),
    active: view.turn === color && view.status.kind === 'ongoing',
    material,
  })
  return { white: player('white', 'White'), black: player('black', 'Black') }
}
