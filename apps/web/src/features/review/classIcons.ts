import type { MoveClass } from '@chessy/analysis'
import { CLASS_STYLES } from './classes'

/**
 * The symbol on each class's round icon, drawn in white in a 40×40 box centred on the origin
 * (circle radius 19). Our own drawings: signs as text, the rest as simple paths.
 */
const SYMBOLS: Record<MoveClass, string> = {
  brilliant: text('!!', 21),
  great: text('!', 24),
  best: '<path d="M0 -10.7L2.8 -3.1L10.9 -2.8L4.6 2.3L6.8 10.1L0 5.6L-6.8 10.1L-4.6 2.3L-10.9 -2.8L-2.8 -3.1Z" fill="#fff"/>',
  excellent:
    // A thumbs-up: cuff on the left, hand with the thumb raised.
    '<path d="M-11.5 -1.5h4.5v12h-4.5z M-5 10.5h11.2c1.9 0 3.3-1.2 3.7-3l1.9-7.6c.5-2-1-3.9-3.1-3.9H2.4l1-5.2c.4-2.2-1-4.3-3-4.3-.7 0-1.3.4-1.6 1L-5 -0.6z" fill="#fff"/>',
  good: '<path d="M-9 0.5l5.8 6.2L9.5 -6.5" fill="none" stroke="#fff" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>',
  book:
    // An open book: two pages meeting at the spine.
    '<path d="M-1 -6.5C-4.5 -9.2-8.6-9.6-12-8.6V8.4c3.4-1 7.5-.6 11 2.1zM1 -6.5C4.5 -9.2 8.6-9.6 12-8.6V8.4c-3.4-1-7.5-.6-11 2.1z" fill="#fff"/>',
  inaccuracy: text('?!', 19),
  mistake: text('?', 24),
  miss: '<path d="M-7 -7L7 7M7 -7L-7 7" stroke="#fff" stroke-width="4.6" stroke-linecap="round"/>',
  blunder: text('??', 20),
}

function text(signs: string, size: number): string {
  return `<text y="1" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-weight="900" font-size="${size}" letter-spacing="-1" fill="#fff">${signs}</text>`
}

/**
 * A class's icon as SVG markup (40×40, centred on the origin). With `outline`, a white ring keeps
 * it readable on the board's squares.
 */
export function classIconSvg(cls: MoveClass, { outline = false } = {}): string {
  const ring = outline ? ' stroke="#fff" stroke-width="2.5"' : ''
  return `<circle r="19" fill="${CLASS_STYLES[cls].color}"${ring}/>${SYMBOLS[cls]}`
}
