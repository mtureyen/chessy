import { libraryTree, type BookLine, type PositionCounts } from '@pawnia/analysis'
import { describe, expect, it } from 'vitest'
import { moveLabel, numbered, studyLine } from './openingGuides'

describe('opening guides', () => {
  it('numbers moves', () => {
    expect(numbered(['e4', 'c6', 'd4'])).toBe('1.e4 c6 2.d4')
    expect(moveLabel(1, 'e4')).toBe('1.e4')
    expect(moveLabel(4, 'd5')).toBe('2...d5')
  })

  it('studies the main moves, then the most played named continuation', () => {
    const lines: BookLine[] = [
      { eco: 'B12', name: 'Caro-Kann Defense: Advance Variation', moves: 'e4 c6 d4 d5 e5' },
      { eco: 'B13', name: 'Caro-Kann Defense: Exchange Variation', moves: 'e4 c6 d4 d5 exd5' },
    ]
    // No games counted: the order of the book decides between equals.
    const tree = libraryTree(lines, {} as Record<string, PositionCounts>)
    expect(studyLine(['e4', 'c6'], tree)).toEqual(['e4', 'c6', 'd4', 'd5', 'e5'])
  })
})
