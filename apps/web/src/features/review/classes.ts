import type { MoveClass } from '@chessy/analysis'

export interface ClassStyle {
  label: string
  glyph: string
  color: string
}

/** Labels, glyphs and colors per classification (close to chess.com's palette). */
export const CLASS_STYLES: Record<MoveClass, ClassStyle> = {
  brilliant: { label: 'Brilliant', glyph: '!!', color: '#1baca6' },
  great: { label: 'Great', glyph: '!', color: '#5c8bb0' },
  best: { label: 'Best', glyph: '★', color: '#81b64c' },
  excellent: { label: 'Excellent', glyph: '✓', color: '#96bc4b' },
  good: { label: 'Good', glyph: '✓', color: '#7f9c6c' },
  book: { label: 'Book', glyph: '≡', color: '#a88865' },
  forced: { label: 'Forced', glyph: '□', color: '#8a9a83' },
  inaccuracy: { label: 'Inaccuracy', glyph: '?!', color: '#e6b422' },
  mistake: { label: 'Mistake', glyph: '?', color: '#f08c2e' },
  miss: { label: 'Miss', glyph: '✗', color: '#e8644d' },
  blunder: { label: 'Blunder', glyph: '??', color: '#d43d2c' },
}

/** Order in the summary table (as on chess.com). */
export const SUMMARY_ORDER: readonly MoveClass[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'forced',
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
