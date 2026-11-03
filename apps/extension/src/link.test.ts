import { describe, expect, it } from 'vitest'
import { chessyLink, normalizeChessyUrl } from './link'

describe('chessyLink', () => {
  it('links game pages to Chessy, passing the page address along', () => {
    expect(chessyLink('http://localhost:5173/', 'https://lichess.org/HqjDTU4A')).toBe(
      'http://localhost:5173/open?url=https%3A%2F%2Flichess.org%2FHqjDTU4A',
    )
    expect(chessyLink('', 'https://www.chess.com/game/live/186381504066')).toBe(
      'http://localhost:5173/open?url=https%3A%2F%2Fwww.chess.com%2Fgame%2Flive%2F186381504066',
    )
  })

  it('offers nothing on pages without a game', () => {
    expect(chessyLink('http://localhost:5173', 'https://www.chess.com/home')).toBeUndefined()
    expect(chessyLink('http://localhost:5173', 'https://lichess.org/analysis')).toBeUndefined()
  })
})

describe('normalizeChessyUrl', () => {
  it('keeps http(s) addresses without a trailing slash', () => {
    expect(normalizeChessyUrl(' https://chessy.example/app/ ')).toBe('https://chessy.example/app')
    expect(normalizeChessyUrl('http://localhost:5173')).toBe('http://localhost:5173')
    expect(normalizeChessyUrl('javascript:alert(1)')).toBeUndefined()
    expect(normalizeChessyUrl('nonsense')).toBeUndefined()
  })
})
