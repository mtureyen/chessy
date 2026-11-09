import { describe, expect, it } from 'vitest'
import { pawniaLink, normalizePawniaUrl } from './link'

describe('pawniaLink', () => {
  it('links game pages to pawnia, passing the page address along', () => {
    expect(pawniaLink('http://localhost:5173/', 'https://lichess.org/HqjDTU4A')).toBe(
      'http://localhost:5173/open?url=https%3A%2F%2Flichess.org%2FHqjDTU4A',
    )
    expect(pawniaLink('', 'https://www.chess.com/game/live/186381504066')).toBe(
      'http://localhost:5173/open?url=https%3A%2F%2Fwww.chess.com%2Fgame%2Flive%2F186381504066',
    )
  })

  it('offers nothing on pages without a game', () => {
    expect(pawniaLink('http://localhost:5173', 'https://www.chess.com/home')).toBeUndefined()
    expect(pawniaLink('http://localhost:5173', 'https://lichess.org/analysis')).toBeUndefined()
  })
})

describe('normalizePawniaUrl', () => {
  it('keeps http(s) addresses without a trailing slash', () => {
    expect(normalizePawniaUrl(' https://pawnia.example/app/ ')).toBe('https://pawnia.example/app')
    expect(normalizePawniaUrl('http://localhost:5173')).toBe('http://localhost:5173')
    expect(normalizePawniaUrl('javascript:alert(1)')).toBeUndefined()
    expect(normalizePawniaUrl('nonsense')).toBeUndefined()
  })
})
