import { useCallback, useState } from 'react'
import {
  createGame,
  type Color,
  type GameState,
  type GameStatus,
  type MoveNode,
  type SquareName,
} from '@chessy/chess'

/** Everything the UI renders from a game, captured once per change. */
export interface GameView {
  fen: string
  turn: Color
  check: boolean
  status: GameStatus
  /** Empty once the game is over, which freezes the board for local play. */
  dests: Map<SquareName, SquareName[]>
  lastMove: [SquareName, SquareName] | undefined
  line: MoveNode[]
  current: MoveNode
  atStart: boolean
  atEnd: boolean
}

function viewOf(game: GameState): GameView {
  const status = game.status()
  const move = game.current.move
  return {
    fen: game.fen(),
    turn: game.turn(),
    check: game.isCheck(),
    status,
    dests: status.kind === 'ongoing' ? game.dests() : new Map(),
    lastMove: move ? [move.from, move.to] : undefined,
    line: game.line(),
    current: game.current,
    atStart: game.current === game.root,
    atEnd: game.current.children.length === 0,
  }
}

/**
 * Holds a mutable GameState. Every change goes through `update` (or `replace`),
 * which re-snapshots the view so React re-renders.
 */
export function useGame() {
  const [state, setState] = useState(() => {
    const game = createGame()
    return { game, view: viewOf(game) }
  })

  const update = useCallback(
    (change: (game: GameState) => unknown) => {
      change(state.game)
      setState({ game: state.game, view: viewOf(state.game) })
    },
    [state.game],
  )

  const replace = useCallback((game: GameState) => setState({ game, view: viewOf(game) }), [])

  return { game: state.game, view: state.view, update, replace }
}
