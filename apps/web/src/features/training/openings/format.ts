import { lastMove } from '@/features/stats/format'

/**
 * An opening named from the player's side: their own system as is, the opponent's choice as
 * "against" it. With White a defence is the opponent's; with Black anything but a defence is.
 */
export function openingLabel(family: string, color: 'white' | 'black'): string {
  const defence = /\b(defense|defence)\b/i.test(family)
  return defence === (color === 'white') ? `against the ${family}` : family
}

/** What theory had instead of a move, with move numbers: "3.Qg4 or 3.Na4". */
export function theoryText(moves: readonly string[], theory: readonly string[]): string {
  const before = moves.slice(0, -1)
  const shown = theory.slice(0, 4).map((san) => lastMove([...before, san]))
  const more = theory.length > shown.length ? ` (+${theory.length - shown.length} more)` : ''
  return shown.length <= 1
    ? `${shown[0] ?? ''}${more}`
    : `${shown.slice(0, -1).join(', ')} or ${shown.at(-1)}${more}`
}

/** "you leave theory first, usually at move 3": who leaves theory in these games. */
export function departureText({
  you,
  them,
  none,
  youAt,
}: {
  you: number
  them: number
  none: number
  youAt?: number
}): string {
  const total = you + them + none
  if (total === 0) return ''
  if (you >= them && you >= none)
    return `you leave theory first in ${you} of ${total}${youAt ? `, usually at move ${youAt}` : ''}`
  if (them >= none) return `your opponents leave theory first in ${them} of ${total}`
  return `${none} of ${total} stay in theory as far as the book goes`
}

/** A move with its number, from its half-move: "3.d3", "3…Bc5". */
export function moveText(ply: number, san: string): string {
  return `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '…'}${san}`
}
