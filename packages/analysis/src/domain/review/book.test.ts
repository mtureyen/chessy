import { createGame } from '@chessy/chess'
import { describe, expect, it } from 'vitest'
import { bookKey, buildBookData, createOpeningBook } from './book'

const fenAfter = (...moves: string[]) => {
  const game = createGame()
  for (const m of moves) game.play(m)
  return game.fen()
}

describe('opening book', () => {
  const book = createOpeningBook(
    buildBookData([
      { eco: 'C60', name: 'Ruy Lopez', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5' },
      { eco: 'B20', name: 'Sicilian Defense', pgn: '1. e4 c5' },
    ]),
  )

  it('knows every position on the way to a named opening', () => {
    expect(book.isBook(fenAfter('e4', 'e5', 'Nf3'))).toBe(true)
    expect(book.opening(fenAfter('e4', 'e5', 'Nf3'))).toBeUndefined()
    expect(book.opening(fenAfter('e4', 'e5', 'Nf3', 'Nc6', 'Bb5'))).toEqual({
      eco: 'C60',
      name: 'Ruy Lopez',
    })
    expect(book.opening(fenAfter('e4', 'c5'))).toEqual({ eco: 'B20', name: 'Sicilian Defense' })
  })

  it('ignores move counters and finds transpositions', () => {
    const viaOtherOrder = fenAfter('Nf3', 'Nc6', 'e4', 'e5')
    expect(book.isBook(viaOtherOrder)).toBe(true) // same position as 1. e4 e5 2. Nf3 Nc6
    expect(book.isBook(fenAfter('a4'))).toBe(false)
  })

  it('hashes positions compactly and stably', () => {
    const key = bookKey(createGame().fen())
    expect(key).toMatch(/^[0-9a-z]{6,11}$/)
    expect(bookKey(createGame().fen().replace(' 0 1', ' 7 42'))).toBe(key)
  })
})
