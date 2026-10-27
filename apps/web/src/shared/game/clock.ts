import type { Color, MoveNode } from '@chessy/chess'

/** `1:05:09`, `4:59`, and tenths under ten seconds: `0:04.1`. */
export function formatClock(seconds: number): string {
  if (seconds < 10) return `0:0${Math.max(0, seconds).toFixed(1)}`
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** The clock `color` had after their last move up to `node` (PGN [%clk]); undefined if unknown. */
export function clockAt(node: MoveNode, color: Color): number | undefined {
  for (let n: MoveNode | undefined = node; n; n = n.parent) {
    if (n.move?.color === color && n.clock !== undefined) return n.clock
  }
  return undefined
}
