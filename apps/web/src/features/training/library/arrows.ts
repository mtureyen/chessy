import { createGame } from '@pawnia/chess'
import type { BoardDrawing, DrawnArrow } from '@/shared/board/Board'

/** A move played in the explored position, and in how many games. */
export interface PlayedMove {
  san: string
  games: number
}

/** The most arrows the explorer draws: more make the board unreadable. */
const MAX_ARROWS = 6
/** Moves played less often than this get no arrow (unless pointed at in the list). */
const MIN_SHARE = 0.02
const THIN = 4
const THICK = 15

/**
 * What is played in a position, as arrows: the more games, the thicker. Green stays within the
 * opening's own lines, grey leaves them; the move pointed at in the list is blue.
 */
export function explorerArrows(
  fen: string,
  moves: readonly PlayedMove[],
  inOpening: (san: string) => boolean,
  pointedAt?: string,
): BoardDrawing {
  const total = moves.reduce((sum, m) => sum + m.games, 0)
  if (total === 0) return { arrows: [], squares: [] }
  const shown = [...moves]
    .filter((m) => m.games > 0)
    .sort((a, b) => b.games - a.games)
    .filter((m, i) => m.san === pointedAt || (i < MAX_ARROWS && m.games / total >= MIN_SHARE))
  const arrows = shown.flatMap((m): DrawnArrow[] => {
    const move = createGame(fen).play(m.san)?.move
    if (!move) return []
    return [
      {
        from: move.from,
        to: move.to,
        color: m.san === pointedAt ? 'blue' : inOpening(m.san) ? 'green' : 'grey',
        width: Math.round(THIN + (THICK - THIN) * (m.games / total)),
      },
    ]
  })
  // The pointed-at arrow last, so it is drawn on top.
  return {
    arrows: arrows.sort((a, b) => +(a.color === 'blue') - +(b.color === 'blue')),
    squares: [],
  }
}

/** How many of a line's coming moves are drawn. */
export const NEXT_STEPS = 3
const STEP_WIDTHS = [12, 8, 6]

/**
 * The next moves of a line from the position after `ply` moves, in order: the next one strong, the
 * ones after it fainter and numbered. The user's moves are green, the other side's grey.
 */
export function nextStepArrows(
  line: readonly string[],
  ply: number,
  side: 'white' | 'black',
  steps = NEXT_STEPS,
): BoardDrawing {
  const game = createGame()
  for (const san of line.slice(0, ply)) game.play(san)
  const coming = line.slice(ply, ply + steps)
  const arrows = coming.flatMap((san, i): DrawnArrow[] => {
    const move = game.play(san)?.move
    if (!move) return []
    const yours = ((ply + i) % 2 === 0) === (side === 'white')
    return [
      {
        from: move.from,
        to: move.to,
        color: yours ? 'green' : 'grey',
        width: STEP_WIDTHS[Math.min(i, STEP_WIDTHS.length - 1)]!,
        ...(i > 0 && { faint: true }),
        ...(coming.length > 1 && { label: String(i + 1) }),
      },
    ]
  })
  // The next move last, so it is drawn on top of the later ones.
  return { arrows: arrows.reverse(), squares: [] }
}

/** Every way into the opening's named lines: "e4", "e4 c6", … */
export function openingPaths(tree: readonly { moves: readonly string[] }[]): Set<string> {
  const paths = new Set<string>()
  for (const { moves } of tree)
    for (let n = 1; n <= moves.length; n++) paths.add(moves.slice(0, n).join(' '))
  return paths
}

const KEY = 'pawnia.library-arrows'

/** Whether the library draws its arrows: on unless switched off in this browser. */
export function arrowsWanted(
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
): boolean {
  try {
    return storage?.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function rememberArrows(
  on: boolean,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // Not remembered, then: private windows and blocked storage are fine.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}
