import { createGame } from '@pawnia/chess'
import type { LibraryOpeningBody } from '@pawnia/contracts'
import { moveLabel } from './format'

type Trap = LibraryOpeningBody['traps'][number]

/** A move that looks right and isn't: what to say when it is tried. */
export interface Pitfall {
  san: string
  text: string
}

/** A trap as a line to learn, from one side. */
export interface TrapDrill {
  side: 'white' | 'black'
  title: string
  line: string[]
  /** What to tell at a move, by ply. */
  notes: Map<number, string>
  /** The move to stay away from, by ply. */
  pitfalls: Map<number, Pitfall>
}

const name = (side: 'white' | 'black') => (side === 'white' ? 'White' : 'Black')

/**
 * Springing the trap, as the side that sets it: the way there, the move most players fall for,
 * and how to punish it. Undefined when the library has no legal punishing move.
 */
export function springDrill(trap: Trap): TrapDrill | undefined {
  const way = trap.moves ? trap.moves.split(' ') : []
  const punish = legalFrom([...way, trap.bait], sans(trap.punish))
  if (punish.length === 0) return undefined
  const baitPly = way.length + 1
  return {
    side: trap.trapper,
    title: `Trap after ${moveLabel(baitPly, trap.bait)}: spring it`,
    line: [...way, trap.bait, ...punish],
    notes: new Map([
      [baitPly, `The mistake: ${trap.baitShare}% of players under 1600 play this here.`],
      [
        baitPly + 1,
        `This punishes it: ${name(trap.trapper)} scores ${trap.trapperScore}% from here under 1600.`,
      ],
    ]),
    pitfalls: new Map(),
  }
}

/**
 * Avoiding the trap, as the side it is set for: the way there, then the better move; the move
 * most players make is the pitfall. Undefined when the library knows no better move.
 */
export function avoidDrill(trap: Trap): TrapDrill | undefined {
  if (!trap.best) return undefined
  const way = trap.moves ? trap.moves.split(' ') : []
  if (legalFrom(way, [trap.best]).length === 0) return undefined
  const ply = way.length + 1
  const bait = moveLabel(ply, trap.bait)
  const after = `after ${trap.punish} ${name(trap.trapper)} scores ${trap.trapperScore}% under 1600`
  return {
    side: trap.trapper === 'white' ? 'black' : 'white',
    title: `Trap after ${bait}: avoid it`,
    line: [...way, trap.best],
    notes: new Map([
      [ply, `This stays out of the trap. ${bait} is what ${trap.baitShare}% play: ${after}.`],
    ]),
    pitfalls: new Map([[ply, { san: trap.bait, text: `${bait} is the trap: ${after}.` }]]),
  }
}

/** The moves of a numbered line: "8. Bxd5 Qf6 9. Bxc6+" → Bxd5, Qf6, Bxc6+. */
function sans(numbered: string): string[] {
  return numbered.split(/\s+/).filter((token) => token !== '' && !/^\d+\.+$/.test(token))
}

/** As many of `moves` as are legal one after the other, after `before`. */
function legalFrom(before: readonly string[], moves: readonly string[]): string[] {
  const game = createGame()
  for (const san of before) if (!game.play(san)) return []
  const legal: string[] = []
  for (const san of moves) {
    if (!game.play(san)) break
    legal.push(san)
  }
  return legal
}
