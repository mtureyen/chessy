import type { MoveNode } from '@chessy/chess'

/** A main-line row: move number plus White's and Black's move (either may be missing). */
export interface MoveRow {
  kind: 'row'
  number: number
  white?: MoveNode
  black?: MoveNode
  /** The row is interrupted by variations after White's move; Black's cell shows "…". */
  interrupted?: boolean
}

/** Side lines branching off at one point, rendered as a block between main-line rows. */
export interface VariationBlock {
  kind: 'variations'
  lines: VariationToken[][]
}

export type MoveTreeItem = MoveRow | VariationBlock

export type VariationToken =
  { kind: 'move'; node: MoveNode; number?: string } | { kind: 'open' } | { kind: 'close' }

/**
 * Lays out the move tree lichess-style: the main line in rows of two, each set of
 * alternatives as a block right after the main-line move they compete with.
 */
export function moveTreeItems(root: MoveNode): MoveTreeItem[] {
  const items: MoveTreeItem[] = []
  let row: MoveRow | undefined
  let parent = root
  for (let node = root.children[0]; node; parent = node, node = node.children[0]) {
    const { color, moveNumber } = node.move!
    if (color === 'white' || !row || row.black || row.number !== moveNumber) {
      row = { kind: 'row', number: moveNumber, [color]: node }
      items.push(row)
    } else {
      row.black = node
    }

    const alternatives = parent.children.slice(1)
    if (alternatives.length > 0) {
      if (color === 'white') row.interrupted = true
      items.push({ kind: 'variations', lines: alternatives.map(variationTokens) })
      row = undefined
    }
  }
  return items
}

/** One side line as tokens; nested alternatives appear in parentheses after the move they replace. */
export function variationTokens(start: MoveNode): VariationToken[] {
  const tokens: VariationToken[] = []
  let needsNumber = true
  for (let node: MoveNode | undefined = start; node; node = node.children[0]) {
    const { color, moveNumber } = node.move!
    const number =
      color === 'white' ? `${moveNumber}.` : needsNumber ? `${moveNumber}...` : undefined
    tokens.push(number ? { kind: 'move', node, number } : { kind: 'move', node })
    needsNumber = false

    const siblings = node !== start ? (node.parent?.children.slice(1) ?? []) : []
    for (const alternative of siblings) {
      tokens.push({ kind: 'open' }, ...variationTokens(alternative), { kind: 'close' })
      needsNumber = true
    }
  }
  return tokens
}
