import type { GameReview, ReviewedMove } from '@chessy/analysis'
import type { MoveNode } from '@chessy/chess'

/** The main line's nodes, first move first. */
export function mainline(root: MoveNode): MoveNode[] {
  const nodes: MoveNode[] = []
  for (let n = root.children[0]; n; n = n.children[0]) nodes.push(n)
  return nodes
}

/**
 * Pairs reviewed moves with the tree's main-line nodes by node id. Stops where the main line
 * no longer matches the reviewed game (e.g. after the user promoted a variation).
 */
export function reviewedNodes(root: MoveNode, review: GameReview): Map<string, ReviewedMove> {
  const byNode = new Map<string, ReviewedMove>()
  if (root.fen !== review.startFen) return byNode
  const nodes = mainline(root)
  for (const [i, move] of review.moves.entries()) {
    const node = nodes[i]
    if (!node || node.move?.uci !== move.uci) break
    byNode.set(node.id, move)
  }
  return byNode
}
