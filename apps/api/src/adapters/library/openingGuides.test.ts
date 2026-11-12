import { libraryTree, type BookLine, type PositionCounts } from '@pawnia/analysis'
import { describe, expect, it } from 'vitest'
import { moveLabel, numbered, studyLine, withPositions } from './openingGuides'

describe('opening guides', () => {
  it('numbers moves', () => {
    expect(numbered(['e4', 'c6', 'd4'])).toBe('1.e4 c6 2.d4')
    expect(moveLabel(1, 'e4')).toBe('1.e4')
    expect(moveLabel(4, 'd5')).toBe('2...d5')
  })

  it('gives the coach each move with the position after it', () => {
    expect(withPositions(['e4', 'c6'])).toEqual([
      { ply: 1, move: '1.e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' },
      {
        ply: 2,
        move: '1...c6',
        fen: 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      },
    ])
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
