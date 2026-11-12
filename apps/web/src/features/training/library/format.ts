import type { LibraryOpeningBody } from '@pawnia/contracts'
import { lineText } from '@/features/stats/format'

export type Band = 'under-1200' | '1200-1599' | '1600-1999' | '2000+'
export type BandChoice = Band | 'all'
export type Results = [number, number, number]
export type BandStats = Record<Band, Results>

export const BANDS: readonly Band[] = ['under-1200', '1200-1599', '1600-1999', '2000+']

export const BAND_LABELS: Record<BandChoice, string> = {
  all: 'All',
  'under-1200': 'Under 1200',
  '1200-1599': '1200–1599',
  '1600-1999': '1600–1999',
  '2000+': '2000+',
}

/** White wins, draws, Black wins in one band, or all of them summed. */
export function results(stats: BandStats, band: BandChoice): Results {
  if (band !== 'all') return stats[band]
  return BANDS.reduce<Results>(
    (sum, b) => [sum[0] + stats[b][0], sum[1] + stats[b][1], sum[2] + stats[b][2]],
    [0, 0, 0],
  )
}

export const games = ([w, d, b]: Results) => w + d + b

/** The three results in whole percent, adding up to 100 (the largest takes the rounding). */
export function percents(r: Results): Results {
  const total = games(r)
  if (total === 0) return [0, 0, 0]
  const p = r.map((n) => Math.round((n / total) * 100)) as Results
  const largest = p.indexOf(Math.max(...p))
  p[largest]! += 100 - (p[0] + p[1] + p[2])
  return p
}

/** Points per game for one side, percent; undefined without games. */
export function scoreOf([w, d, b]: Results, side: 'white' | 'black'): number | undefined {
  const total = w + d + b
  if (total === 0) return undefined
  return Math.round((((side === 'white' ? w : b) + d / 2) / total) * 100)
}

/** "12.3k", "940": games, short. */
export function gamesText(n: number): string {
  return n >= 10_000
    ? `${Math.round(n / 1000)}k`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : String(n)
}

export const GROUP_LABELS = {
  white: 'For White',
  'vs-e4': 'For Black against 1.e4',
  'vs-d4': 'For Black against 1.d4',
} as const

export const STYLE_LABELS = {
  classical: 'Classical',
  solid: 'Solid',
  sharp: 'Sharp',
  gambit: 'Gambit',
  system: 'System',
} as const

type Trap = LibraryOpeningBody['traps'][number]

/** A trap in a sentence: where, what most players under 1600 do there, and how it ends. */
export function trapText(trap: Trap): string {
  const moves = trap.moves.split(' ')
  const where = moves.length === 0 ? 'At the start' : `After ${lineText(moves)}`
  const victim = trap.trapper === 'white' ? 'Black' : 'White'
  const trapper = trap.trapper === 'white' ? 'White' : 'Black'
  return `${where}, ${trap.baitShare}% of ${victim} players under 1600 play ${trap.bait}. ${trapper} then scores ${trap.trapperScore}%.`
}

/** A move with its number, from its half-move: "2.d4", "2...d5". */
export function moveLabel(ply: number, san: string): string {
  const number = Math.ceil(ply / 2)
  return ply % 2 === 1 ? `${number}.${san}` : `${number}...${san}`
}

/**
 * Whether two opening names mean the same opening. The platforms spell them differently:
 * chess.com's names come without apostrophes and hyphens ("Kings Gambit", "Caro Kann Defense")
 * and sometimes with "Opening" at the end ("Ruy Lopez Opening").
 */
export function sameOpening(a: string, b: string): boolean {
  const plain = (name: string) =>
    name
      .toLowerCase()
      .replace(/-/g, ' ')
      .replace(/[^a-z ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/ opening$/, '')
  return plain(a) === plain(b)
}
