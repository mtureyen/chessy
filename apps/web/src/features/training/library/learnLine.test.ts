import { describe, expect, it } from 'vitest'
import {
  guideDrawings,
  guideNotes,
  helpFor,
  HINT_AFTER,
  sameMove,
  verdictText,
  yourPlies,
} from './learnLine'

describe('learning a line', () => {
  it('knows which moves are the user’s', () => {
    const line = ['e4', 'c6', 'd4', 'd5', 'e5']
    expect(yourPlies(line, 'white')).toEqual([1, 3, 5])
    expect(yourPlies(line, 'black')).toEqual([2, 4])
  })

  it('compares moves without check marks', () => {
    expect(sameMove('Qf3+', 'Qf3')).toBe(true)
    expect(sameMove('Bb5', 'Bb5+')).toBe(true)
    expect(sameMove('Nf3', 'Nc3')).toBe(false)
  })
})

describe('helpFor', () => {
  it('fades run by run: every move shown, then after a miss, then from memory', () => {
    expect(helpFor(0).arrowAfter).toBe(0)
    expect(helpFor(1).arrowAfter).toBe(1)
    expect(helpFor(2).arrowAfter).toBe(HINT_AFTER)
    expect(helpFor(7).arrowAfter).toBe(HINT_AFTER)
    expect([1, 2, 3].map((run) => helpFor(run).again)).toEqual([
      'Again, with less help',
      'Again, from memory',
      'Play it again',
    ])
  })

  it('is from memory without a run: a review, or arrows switched off', () => {
    expect(helpFor(undefined)).toMatchObject({ arrowAfter: HINT_AFTER, again: 'Play it again' })
  })
})

describe('verdictText', () => {
  it('says what a move off the line is worth', () => {
    expect(verdictText('2...e6', 'theory')).toBe('2...e6 is theory too, but it is another line.')
    expect(verdictText('2...g6', 'playable')).toContain('playable')
    expect(verdictText('2...Qh4', 'wrong')).toBe('2...Qh4 is a mistake here.')
  })
})

describe('guideNotes', () => {
  const moves = [
    { ply: 1, san: 'e4', note: 'Centre.' },
    { ply: 2, san: 'c6', note: 'Prepares ...d5.' },
    { ply: 3, san: 'd4', note: 'A broad centre.' },
  ]

  it('gives the notes as far as the line follows the guide', () => {
    expect([...guideNotes(['e4', 'c6', 'Nc3', 'd5'], moves)]).toEqual([
      [1, 'Centre.'],
      [2, 'Prepares ...d5.'],
    ])
    expect(guideNotes(['d4'], moves).size).toBe(0)
  })
})

describe('guideDrawings', () => {
  const draw = { arrows: [{ from: 'c6', to: 'd5', color: 'green' as const }], squares: [] }
  const moves = [
    { ply: 1, san: 'e4', note: 'Centre.' },
    { ply: 2, san: 'c6', note: 'Prepares ...d5.', draw },
    { ply: 3, san: 'd4', note: 'A broad centre.', draw },
  ]

  it('gives the drawings as far as the line follows the guide', () => {
    expect([...guideDrawings(['e4', 'c6', 'Nc3'], moves)]).toEqual([[2, draw]])
    expect(guideDrawings(['e4', 'e5'], moves).size).toBe(0)
  })
})
