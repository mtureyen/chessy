import { lineKeys, START_SET, type LibraryFile } from '@pawnia/analysis'
import { createGame } from '@pawnia/chess'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** The checked-in library: built by scripts/build-library.ts, read by the API. */
const library = JSON.parse(
  readFileSync(new URL('../../../data/opening-library.json', import.meta.url), 'utf8'),
) as LibraryFile

describe('the opening library file', () => {
  it('has every opening of the start set, with lines and numbers from its main position', () => {
    expect(library.version).toBe(1)
    expect(library.openings.map((o) => o.id)).toEqual(START_SET.map((e) => e.id))
    for (const opening of library.openings) {
      expect(opening.lines.length, opening.id).toBeGreaterThan(0)
      const main = lineKeys(opening.main.split(' '))!.at(-1)!
      expect(library.positions[main], opening.id).toBeDefined()
      expect(opening.numbers.score['1200-1599'], opening.id).toBeGreaterThan(0)
    }
  })

  it('counted a sample of real games in every band', () => {
    for (const games of Object.values(library.games)) expect(games).toBeGreaterThan(100_000)
  })

  it('has traps whose bait is legal where they say, in openings it knows', () => {
    const ids = new Set(library.openings.map((o) => o.id))
    expect(library.traps.length).toBeGreaterThan(0)
    for (const trap of library.traps) {
      const game = createGame()
      for (const san of trap.moves.split(' ')) expect(game.play(san), trap.moves).toBeTruthy()
      expect(game.play(trap.bait), `${trap.moves} ${trap.bait}`).toBeTruthy()
      for (const { id, moves } of trap.openings) {
        expect(ids.has(id)).toBe(true)
        const there = lineKeys(moves.split(' '))!.at(-1)
        expect(there).toBe(lineKeys(trap.moves.split(' '))!.at(-1))
      }
    }
    // The Fried Liver is one: after 7.Qf3+ most players under 1600 go back with the king.
    const friedLiver = library.traps.find(
      (t) =>
        t.moves === 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+' && t.bait === 'Ke8',
    )
    expect(friedLiver?.openings.map((o) => o.id)).toContain('italian')
  })
})
