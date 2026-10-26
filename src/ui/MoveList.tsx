import { useEffect, useRef } from 'react'
import type { MoveNode } from '../core/types'
import './MoveList.css'

interface MoveListProps {
  line: MoveNode[]
  current: MoveNode
  onSelect: (node: MoveNode) => void
}

interface Row {
  number: number
  white?: MoveNode
  black?: MoveNode
}

export function MoveList({ line, current, onSelect }: MoveListProps) {
  const active = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' })
  }, [current])

  if (line.length === 0) return <p className="move-list-empty">No moves yet</p>

  const renderMove = (node: MoveNode | undefined) => {
    if (!node) return <span className="move move-placeholder">…</span>
    const isCurrent = node === current
    return (
      <button
        type="button"
        ref={isCurrent ? active : undefined}
        className={`move${isCurrent ? ' move-current' : ''}`}
        onClick={() => onSelect(node)}
      >
        {node.move!.san}
      </button>
    )
  }

  return (
    <ol className="move-list">
      {toRows(line).map((row) => (
        <li key={`${row.number}-${(row.white ?? row.black)!.id}`} className="move-row">
          <span className="move-number">{row.number}.</span>
          {renderMove(row.white)}
          {row.black ? renderMove(row.black) : <span className="move" />}
        </li>
      ))}
    </ol>
  )
}

function toRows(line: MoveNode[]): Row[] {
  const rows: Row[] = []
  for (const node of line) {
    const { color, moveNumber } = node.move!
    const last = rows.at(-1)
    if (color === 'white') rows.push({ number: moveNumber, white: node })
    else if (last && last.number === moveNumber && !last.black) last.black = node
    else rows.push({ number: moveNumber, black: node })
  }
  return rows
}
