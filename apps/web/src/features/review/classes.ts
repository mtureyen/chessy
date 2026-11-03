import type { MoveClass } from '@chessy/analysis'

export interface ClassStyle {
  label: string
  color: string
}

/** Labels and colors per classification (close to chess.com's palette); icons in classIcons.ts. */
export const CLASS_STYLES: Record<MoveClass, ClassStyle> = {
  brilliant: { label: 'Brilliant', color: '#1baca6' },
  great: { label: 'Great', color: '#5c8bb0' },
  best: { label: 'Best', color: '#81b64c' },
  excellent: { label: 'Excellent', color: '#96bc4b' },
  good: { label: 'Good', color: '#7f9c6c' },
  book: { label: 'Book', color: '#a88865' },
  inaccuracy: { label: 'Inaccuracy', color: '#e6b422' },
  mistake: { label: 'Mistake', color: '#f08c2e' },
  miss: { label: 'Miss', color: '#e8644d' },
  blunder: { label: 'Blunder', color: '#d43d2c' },
}

/** Order in the summary table (as on chess.com). */
export const SUMMARY_ORDER: readonly MoveClass[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
]

/** Classes worth a badge in the move list; the board shows every class for the current move. */
export const LIST_BADGES: ReadonlySet<MoveClass> = new Set([
  'brilliant',
  'great',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
])
