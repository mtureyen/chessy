import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import 'chessground/assets/chessground.base.css'
import type { Config } from 'chessground/config'
import type { DrawShape } from 'chessground/draw'
import type { Key } from 'chessground/types'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Color, Move, SquareName } from '@chessy/chess'
import { useBoardAppearance } from './appearanceStore'
import './Board.css'
import { PromotionDialog } from './PromotionDialog'

export interface BoardProps {
  fen: string
  orientation: Color
  turnColor: Color
  /** Legal destinations for the side to move. Empty makes the board read-only. */
  dests: Map<SquareName, SquareName[]>
  lastMove?: [SquareName, SquareName]
  check: boolean
  isPromotion: (from: SquareName, to: SquareName) => boolean
  onMove: (move: Move) => void
  /** Arrows drawn by the app (engine suggestions). Separate from arrows the user draws. */
  arrows?: BoardArrow[]
  /** A small round badge in a square's corner, e.g. a move classification. */
  badge?: BoardBadge
}

export interface BoardBadge {
  square: SquareName
  /** SVG markup for a 40×40 box centred on the origin. */
  svg: string
}

export interface BoardArrow {
  from: SquareName
  to: SquareName
  kind: 'best' | 'alternative'
}

/**
 * Thin React wrapper around chessground. chessground owns its DOM; React only pushes
 * config updates into it. The board knows no rules: legal moves come in via `dests`.
 */
export function Board(props: BoardProps) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const latest = useRef(props)
  const [promotion, setPromotion] = useState<{ from: SquareName; to: SquareName }>()
  const { coordinates } = useBoardAppearance()

  useLayoutEffect(() => {
    latest.current = props
  })

  useEffect(() => {
    const onDrop = (orig: Key, dest: Key) => {
      const from = orig as SquareName
      const to = dest as SquareName
      if (latest.current.isPromotion(from, to)) setPromotion({ from, to })
      else latest.current.onMove({ from, to })
    }
    const cg = Chessground(host.current!, {
      ...toConfig(latest.current),
      animation: { duration: 180 },
      premovable: { enabled: false },
      highlight: { lastMove: true, check: true },
      movable: {
        ...toConfig(latest.current).movable,
        free: false,
        showDests: true,
        events: { after: onDrop },
      },
    })
    api.current = cg
    return () => {
      cg.destroy()
      api.current = null
    }
  }, [])

  // chessground draws coordinates (on by default) once; turning them off or on needs a redraw.
  useEffect(() => {
    const cg = api.current
    if (!cg || cg.state.coordinates === coordinates) return
    cg.set({ coordinates })
    cg.redrawAll()
  }, [coordinates])

  // Only push when board-relevant props change, so unrelated re-renders don't reset the board.
  const { fen, orientation, turnColor, dests, check } = props
  const lastMove = props.lastMove?.join('')
  useEffect(() => {
    api.current?.set(toConfig(latest.current))
  }, [fen, orientation, turnColor, dests, check, lastMove])

  const { badge } = props
  const shapesKey = [
    ...(props.arrows ?? []).map((a) => `${a.kind}:${a.from}${a.to}`),
    badge ? `badge:${badge.square}${badge.svg}` : '',
  ].join(',')
  useEffect(() => {
    // setAutoShapes leaves the user's own drawings alone (cg.set with a fen would clear them).
    const { arrows = [], badge } = latest.current
    api.current?.setAutoShapes([...arrows.map(toShape), ...(badge ? [badgeShape(badge)] : [])])
  }, [shapesKey])

  const cancelPromotion = () => {
    setPromotion(undefined)
    api.current?.set(toConfig(latest.current))
  }

  return (
    <div className="board">
      <div ref={host} className="board-host" />
      {promotion && (
        <PromotionDialog
          color={props.turnColor}
          square={promotion.to}
          orientation={props.orientation}
          onPick={(role) => {
            setPromotion(undefined)
            props.onMove({ ...promotion, promotion: role })
          }}
          onCancel={cancelPromotion}
        />
      )}
    </div>
  )
}

/** Drawn in a 100×100 box whose origin is the square's top-left corner; the badge sits top-right. */
function badgeShape({ square, svg }: BoardBadge): DrawShape {
  return { orig: square, customSvg: { html: `<g transform="translate(86 14)">${svg}</g>` } }
}

function toShape(arrow: BoardArrow): DrawShape {
  return arrow.kind === 'best'
    ? { orig: arrow.from, dest: arrow.to, brush: 'paleBlue' }
    : { orig: arrow.from, dest: arrow.to, brush: 'paleGrey', modifiers: { lineWidth: 7 } }
}

function toConfig(props: BoardProps): Config {
  const canMove = props.dests.size > 0
  return {
    fen: props.fen,
    orientation: props.orientation,
    turnColor: props.turnColor,
    check: props.check,
    lastMove: props.lastMove,
    movable: {
      color: canMove ? props.turnColor : undefined,
      dests: props.dests as Map<Key, Key[]>,
    },
  }
}
