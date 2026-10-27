import {
  createGame,
  type Color,
  type GameState,
  type GameStatus,
  type MoveNode,
  type SquareName,
} from '@chessy/chess'
import { useCallback, useState } from 'react'

/** Everything the UI renders from a game, captured once per change. */
export interface GameView {
  fen: string
  turn: Color
  check: boolean
  status: GameStatus
  /** Legal destinations; empty when the game is over and `freezeWhenOver` is set. */
  dests: Map<SquareName, SquareName[]>
  lastMove: [SquareName, SquareName] | undefined
  line: MoveNode[]
  /** Same object across updates (the tree is mutated in place); re-read it on every render. */
  root: MoveNode
  current: MoveNode
  atStart: boolean
  atEnd: boolean
  isMainline: boolean
}

export interface UseGameOptions {
  /** Local play stops at mate/draw; analysis keeps exploring. */
  freezeWhenOver?: boolean
  initial?: () => GameState
}

function viewOf(game: GameState, freezeWhenOver: boolean): GameView {
  const status = game.status()
  const move = game.current.move
  return {
    fen: game.fen(),
    turn: game.turn(),
    check: game.isCheck(),
    status,
    dests: freezeWhenOver && status.kind !== 'ongoing' ? new Map() : game.dests(),
    lastMove: move ? [move.from, move.to] : undefined,
    line: game.line(),
    root: game.root,
    current: game.current,
    atStart: game.current === game.root,
    atEnd: game.current.children.length === 0,
    isMainline: game.isMainline(game.current),
  }
}

/**
 * Holds a mutable GameState. Every change goes through `update` (or `replace`),
 * which re-snapshots the view so React re-renders.
 */
export function useGame({ freezeWhenOver = false, initial = createGame }: UseGameOptions = {}) {
  const [state, setState] = useState(() => {
    const game = initial()
    return { game, view: viewOf(game, freezeWhenOver) }
  })

  const update = useCallback(
    (change: (game: GameState) => unknown) => {
      change(state.game)
      setState({ game: state.game, view: viewOf(state.game, freezeWhenOver) })
    },
    [state.game, freezeWhenOver],
  )

  const replace = useCallback(
    (game: GameState) => setState({ game, view: viewOf(game, freezeWhenOver) }),
    [freezeWhenOver],
  )

  return { game: state.game, view: state.view, update, replace }
}
