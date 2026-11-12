import type { DrawBrush, DrawShape } from 'chessground/draw'
import type { Key } from 'chessground/types'

/**
 * The user's own markings, like on chess.com: right-click colours a square, right-drag draws an
 * arrow, left-click clears both. chessground picks the brush from the modifier keys (none →
 * green, Shift or Ctrl → red, Alt → blue, both → yellow); we colour those brushes chess.com-like:
 * orange arrows and red squares without a modifier, then green, blue and yellow. The square
 * colours are in Board.css.
 */
export const MARK_COLORS = {
  green: { arrow: '#ffaa00', name: 'default' },
  red: { arrow: '#82b440', name: 'green' },
  blue: { arrow: '#3f9fd8', name: 'blue' },
  yellow: { arrow: '#e9cf3a', name: 'yellow' },
} as const

export type MarkBrush = keyof typeof MARK_COLORS

/** chessground brushes for the user's arrows (the app's own arrows keep their pale brushes). */
export const MARK_BRUSHES: Record<MarkBrush, DrawBrush> = {
  green: { key: 'g', color: MARK_COLORS.green.arrow, opacity: 0.85, lineWidth: 12 },
  red: { key: 'r', color: MARK_COLORS.red.arrow, opacity: 0.85, lineWidth: 12 },
  blue: { key: 'b', color: MARK_COLORS.blue.arrow, opacity: 0.85, lineWidth: 12 },
  yellow: { key: 'y', color: MARK_COLORS.yellow.arrow, opacity: 0.85, lineWidth: 12 },
}

const DRAWING_COLORS = {
  green: '#5f9e2f',
  red: '#d64534',
  blue: '#3f9fd8',
  yellow: '#e0b520',
  grey: '#8b919c',
} as const

/** The colours the app draws in: the coach's four, and grey for what matters less. */
export type DrawingColor = keyof typeof DRAWING_COLORS
export type CoachColor = Exclude<DrawingColor, 'grey'>

/**
 * The app's own brushes, apart from the user's: each colour as it looks (the coach's "green" is
 * green), and a faint one of each for what comes later or matters less.
 */
export const COACH_BRUSHES: Record<string, DrawBrush> = Object.fromEntries(
  (Object.entries(DRAWING_COLORS) as [DrawingColor, string][]).flatMap(([name, color]) => [
    [
      coachBrush(name),
      { key: `c-${name}`, color, opacity: name === 'yellow' ? 0.9 : 0.85, lineWidth: 12 },
    ],
    [coachBrush(name, true), { key: `c-${name}-faint`, color, opacity: 0.45, lineWidth: 12 }],
  ]),
)

export function coachBrush(color: DrawingColor, faint = false): string {
  return `coach${color[0]!.toUpperCase()}${color.slice(1)}${faint ? 'Faint' : ''}`
}

/**
 * Turns the circles chessground just drew into square markings: a square marked again in the same
 * colour is cleared, in another colour recoloured. Returns the new markings and the shapes left
 * for chessground (the arrows), or undefined when no circle was drawn.
 */
export function takeSquareMarks(
  shapes: readonly DrawShape[],
  marks: ReadonlyMap<Key, MarkBrush>,
): { marks: Map<Key, MarkBrush>; arrows: DrawShape[] } | undefined {
  const circles = shapes.filter((shape) => !shape.dest)
  if (circles.length === 0) return undefined
  const next = new Map(marks)
  for (const { orig, brush } of circles) {
    const color = isMarkBrush(brush) ? brush : 'green'
    if (next.get(orig) === color) next.delete(orig)
    else next.set(orig, color)
  }
  return { marks: next, arrows: shapes.filter((shape) => shape.dest) }
}

/** The square classes chessground adds for the markings (styled in Board.css). */
export function markClasses(marks: ReadonlyMap<Key, MarkBrush>): Map<Key, string> {
  return new Map([...marks].map(([square, brush]) => [square, `mark-${MARK_COLORS[brush].name}`]))
}

function isMarkBrush(brush: string | undefined): brush is MarkBrush {
  return brush !== undefined && Object.hasOwn(MARK_COLORS, brush)
}
