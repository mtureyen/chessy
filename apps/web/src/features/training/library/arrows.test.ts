import { describe, expect, it } from 'vitest'
import {
  arrowsWanted,
  explorerArrows,
  nextStepArrows,
  openingPaths,
  rememberArrows,
} from './arrows'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

describe('explorerArrows', () => {
  const played = [
    { san: 'e5', games: 500 },
    { san: 'c6', games: 300 },
    { san: 'c5', games: 190 },
    { san: 'a6', games: 10 },
  ]
  const inCaroKann = (san: string) => san === 'c6'

  it('draws what is played: thicker the more often, green within the opening', () => {
    const { arrows } = explorerArrows(AFTER_E4, played, inCaroKann)
    expect(arrows.map((a) => `${a.from}${a.to} ${a.color}`)).toEqual([
      'e7e5 grey',
      'c7c6 green',
      'c7c5 grey',
    ])
    const widths = arrows.map((a) => a.width!)
    expect(widths[0]).toBeGreaterThan(widths[1]!)
    expect(widths[1]).toBeGreaterThan(widths[2]!)
  })

  it('leaves out rare moves, unless pointed at; the pointed-at move is blue and on top', () => {
    expect(explorerArrows(AFTER_E4, played, inCaroKann).arrows).toHaveLength(3)
    const { arrows } = explorerArrows(AFTER_E4, played, inCaroKann, 'a6')
    expect(arrows).toHaveLength(4)
    expect(arrows.at(-1)).toMatchObject({ from: 'a7', to: 'a6', color: 'blue' })
    expect(explorerArrows(AFTER_E4, played, inCaroKann, 'c6').arrows.at(-1)).toMatchObject({
      from: 'c7',
      color: 'blue',
    })
  })

  it('draws at most six arrows, and none without games', () => {
    const many = ['e5', 'c6', 'c5', 'e6', 'd6', 'd5', 'Nf6', 'g6'].map((san) => ({
      san,
      games: 100,
    }))
    expect(explorerArrows(AFTER_E4, many, () => false).arrows).toHaveLength(6)
    expect(explorerArrows(AFTER_E4, [{ san: 'e5', games: 0 }], () => true).arrows).toEqual([])
    expect(explorerArrows(START, [{ san: 'Qh5', games: 5 }], () => true).arrows).toEqual([])
  })
})

describe('nextStepArrows', () => {
  const line = ['e4', 'c6', 'd4', 'd5', 'e5']

  it('draws the next moves in order: the next one strong and on top, the later ones faint', () => {
    const { arrows } = nextStepArrows(line, 1, 'black')
    expect(arrows).toEqual([
      { from: 'd7', to: 'd5', color: 'green', width: 6, faint: true, label: '3' },
      { from: 'd2', to: 'd4', color: 'grey', width: 8, faint: true, label: '2' },
      { from: 'c7', to: 'c6', color: 'green', width: 12, label: '1' },
    ])
  })

  it('draws all of them faint when something else comes first', () => {
    const { arrows } = nextStepArrows(line, 1, 'black', { allFaint: true })
    expect(arrows.map((a) => a.faint)).toEqual([true, true, true])
  })

  it('colours by whose move it is', () => {
    const colours = nextStepArrows(line, 0, 'white').arrows.map((a) => `${a.label}${a.color}`)
    expect(colours).toEqual(['3green', '2grey', '1green'])
  })

  it('draws what is left near the end: one arrow has no number, the end none at all', () => {
    expect(nextStepArrows(line, 4, 'white').arrows).toEqual([
      { from: 'e4', to: 'e5', color: 'green', width: 12 },
    ])
    expect(nextStepArrows(line, 5, 'white').arrows).toEqual([])
  })
})

describe('openingPaths', () => {
  it('holds every way into the named lines', () => {
    const paths = openingPaths([{ moves: ['e4', 'c6'] }, { moves: ['e4', 'c6', 'd4', 'd5'] }])
    expect([...paths].sort()).toEqual(['e4', 'e4 c6', 'e4 c6 d4', 'e4 c6 d4 d5'])
  })
})

describe('the arrows switch', () => {
  it('is on until switched off, and remembered', () => {
    const kept = new Map<string, string>()
    const storage = {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
    }
    expect(arrowsWanted(storage)).toBe(true)
    rememberArrows(false, storage)
    expect(arrowsWanted(storage)).toBe(false)
    rememberArrows(true, storage)
    expect(arrowsWanted(storage)).toBe(true)
  })

  it('stays on when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(arrowsWanted(blocked)).toBe(true)
    expect(() => rememberArrows(false, blocked)).not.toThrow()
  })
})
