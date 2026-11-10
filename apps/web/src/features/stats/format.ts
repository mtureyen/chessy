import type { PlayerStatsBody } from '@pawnia/contracts'

export type Tally = PlayerStatsBody['record']
export type EndReason = PlayerStatsBody['endings']['wins'][number]['reason']
export type RepertoireLine = PlayerStatsBody['repertoire']['white'][number]

export const END_LABELS: Record<EndReason, string> = {
  checkmate: 'Checkmate',
  resignation: 'Resignation',
  time: 'On time',
  abandoned: 'Abandoned',
  agreement: 'Agreed',
  repetition: 'Repetition',
  stalemate: 'Stalemate',
  'insufficient-material': 'Insufficient material',
  'fifty-move-rule': '50-move rule',
  'timeout-vs-insufficient': 'Time out, not enough to mate',
  other: 'Other',
}

export const DAY_PART_LABELS = {
  night: 'Night 0–6',
  morning: 'Morning 6–12',
  afternoon: 'Afternoon 12–18',
  evening: 'Evening 18–24',
} as const

export const WEEKDAY_LABELS = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
} as const

const PLATFORMS = { chesscom: 'chess.com', lichess: 'lichess', bot: 'pawnia bots', local: 'here' }

/** "chess.com blitz". */
export function seriesName(category: keyof typeof PLATFORMS, speed: string): string {
  return `${PLATFORMS[category]} ${speed}`
}

/** "55%", or "–" without a finished game. */
export function scoreText(tally: Tally): string {
  return tally.score === undefined ? '–' : `${tally.score}%`
}

/** "12-3-6" (wins-draws-losses). */
export function recordText(tally: Tally): string {
  return `${tally.wins}-${tally.draws}-${tally.losses}`
}

/** The opponent groups, written for the page: "Stronger (+100 or more)". */
export function strengthLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1).replace('-100', '−100')
}

/** The last move of a line with its number: "1.e4", "1…c5", "2.Nf3". */
export function lastMove(moves: readonly string[]): string {
  const ply = moves.length
  const number = Math.ceil(ply / 2)
  return `${number}${ply % 2 === 1 ? '.' : '…'}${moves.at(-1) ?? ''}`
}

/** A line from the start: "1.e4 c5 2.Nf3". */
export function lineText(moves: readonly string[]): string {
  return moves.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.${san}` : san)).join(' ')
}

/** Part of a whole in percent, rounded. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

export interface RepertoireTree {
  line: RepertoireLine
  children: RepertoireTree[]
}

/** The flat lines (depth first, as the API sends them) back as a tree. */
export function repertoireTree(lines: readonly RepertoireLine[]): RepertoireTree[] {
  const roots: RepertoireTree[] = []
  const stack: RepertoireTree[] = []
  for (const line of lines) {
    const node = { line, children: [] }
    while (stack.length >= line.moves.length) stack.pop()
    const parent = stack.at(-1)
    ;(parent ? parent.children : roots).push(node)
    stack.push(node)
  }
  return roots
}
