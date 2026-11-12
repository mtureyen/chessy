import { describe, expect, it } from 'vitest'
import { lineKey, openingProgress, progressText } from './progress'

describe('openingProgress', () => {
  const lines = [
    { openingId: 'caro-kann', due: true },
    { openingId: 'caro-kann', due: false },
    { openingId: 'italian', due: true },
    { due: true },
  ]

  it('counts the lines kept of an opening, and the due ones', () => {
    expect(openingProgress(lines, 'caro-kann')).toEqual({ kept: 2, due: 1 })
    expect(openingProgress(lines, 'scotch')).toEqual({ kept: 0, due: 0 })
  })

  it('says it in words', () => {
    expect(progressText({ kept: 2, due: 1 })).toBe('2 lines in your repertoire, 1 due')
    expect(progressText({ kept: 1, due: 0 })).toBe('1 line in your repertoire')
    expect(progressText({ kept: 0, due: 0 })).toBeUndefined()
  })
})

describe('lineKey', () => {
  it('tells lines apart by side and moves', () => {
    expect(lineKey('black', ['e4', 'c6'])).toBe('black e4 c6')
  })
})
