import type { MoveNode } from '@chessy/chess'
import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { moveTreeItems, type VariationToken } from './moveTreeLayout'
import './MoveTree.css'

interface MoveTreeProps {
  root: MoveNode
  current: MoveNode
  onSelect: (node: MoveNode) => void
  /** Extra content after a move's SAN, e.g. a review badge. */
  renderSuffix?: (node: MoveNode) => ReactNode
}

/** The whole game: main line in two columns, side lines as indented blocks (click any move to jump). */
export function MoveTree({ root, current, onSelect, renderSuffix }: MoveTreeProps) {
  const active = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const items = moveTreeItems(root)
  if (items.length === 0) return <p className="move-tree-empty">No moves yet</p>

  const moveButton = (node: MoveNode, className: string, label?: string) => {
    const isCurrent = node === current
    return (
      <button
        type="button"
        ref={isCurrent ? active : undefined}
        className={`${className}${isCurrent ? ' move-current' : ''}`}
        data-san={node.move!.san}
        onClick={() => onSelect(node)}
      >
        {label && <span className="variation-number">{label} </span>}
        {node.move!.san}
        {renderSuffix?.(node)}
      </button>
    )
  }

  // Real spaces between moves keep the text readable for copy & paste and screen readers.
  const renderTokens = (tokens: VariationToken[]) =>
    tokens.map((token, i) => {
      const space = i > 0 && token.kind !== 'close' && tokens[i - 1]?.kind !== 'open' ? ' ' : ''
      if (token.kind === 'close') {
        return (
          <span key={i} className="variation-paren">
            )
          </span>
        )
      }
      return (
        <Fragment key={i}>
          {space}
          {token.kind === 'open' ? (
            <span className="variation-paren">(</span>
          ) : (
            moveButton(token.node, 'variation-move', token.number)
          )}
        </Fragment>
      )
    })

  return (
    <div className="move-tree">
      {items.map((item) =>
        item.kind === 'row' ? (
          <div key={(item.white ?? item.black)!.id} className="move-row">
            <span className="move-number">{item.number}.</span>
            {item.white ? (
              moveButton(item.white, 'move')
            ) : (
              <span className="move move-placeholder">…</span>
            )}
            {item.black ? (
              moveButton(item.black, 'move')
            ) : (
              <span className="move move-placeholder">{item.interrupted ? '…' : ''}</span>
            )}
          </div>
        ) : (
          <div
            key={item.lines[0]?.[0]?.kind === 'move' ? item.lines[0][0].node.id : undefined}
            className="variations"
          >
            {item.lines.map((line, i) => (
              <div key={i} className="variation">
                {renderTokens(line)}
              </div>
            ))}
          </div>
        ),
      )}
    </div>
  )
}
