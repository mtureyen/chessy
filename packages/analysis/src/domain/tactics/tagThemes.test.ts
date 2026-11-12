import { describe, expect, it } from 'vitest'
import { allThemes, tagThemes, TRUSTED_THEMES } from './tagThemes'
import { THEMES } from './themes'

describe('tagThemes', () => {
  it('keeps the themes that are relied on, in lichess’ order', () => {
    // lichess puzzle 01rGp: also a mate, a rook endgame and an x-ray attack.
    const line = {
      fen: '1r6/5pkp/6p1/8/8/8/1pR2PPP/rR4K1 w - - 2 39',
      moves: ['c2b2', 'a1b1', 'b2b1', 'b8b1'],
    }
    expect(allThemes(line)).toEqual([
      'mateIn2',
      'mate',
      'backRankMate',
      'xRayAttack',
      'rookEndgame',
    ])
    expect(tagThemes(line)).toEqual(['mateIn2', 'backRankMate'])
  })

  it('has nothing to say about a line that only has themes it leaves out', () => {
    // lichess puzzle 00347: a quiet move in a pawn endgame.
    const line = {
      fen: '8/2p5/8/2pPk2p/8/4K2P/6P1/8 w - - 1 42',
      moves: ['e3d3', 'h5h4', 'd3c4', 'e5d6'],
    }
    expect(allThemes(line)).toEqual(['quietMove', 'pawnEndgame'])
    expect(tagThemes(line)).toEqual([])
  })

  it('relies only on themes the tagger knows', () => {
    expect(TRUSTED_THEMES.filter((theme) => !THEMES.includes(theme))).toEqual([])
    expect(new Set(TRUSTED_THEMES).size).toBe(TRUSTED_THEMES.length)
  })
})
