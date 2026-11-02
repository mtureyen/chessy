import { describe, expect, it } from 'vitest'
import { hasInsufficientMaterial, materialBalance } from './material'

describe('materialBalance', () => {
  it('is 0 at the start and counts from White’s side', () => {
    expect(materialBalance('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(0)
    expect(materialBalance('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(9)
    expect(materialBalance('4k3/8/8/8/8/8/8/3RK3 w - - 0 1')).toBe(5)
    expect(materialBalance('4k3/1n6/8/8/8/8/P7/4K3 w - - 0 1')).toBe(-2)
  })
})

describe('hasInsufficientMaterial', () => {
  it('tells per side whether it can still mate', () => {
    const kingVsQueen = '4k3/8/8/8/8/8/8/3QK3 w - - 0 1'
    expect(hasInsufficientMaterial(kingVsQueen, 'black')).toBe(true)
    expect(hasInsufficientMaterial(kingVsQueen, 'white')).toBe(false)
    const knightVsPawn = '4k3/4p3/8/8/8/8/8/1N2K3 w - - 0 1'
    expect(hasInsufficientMaterial(knightVsPawn, 'white')).toBe(false) // the pawn can block
    expect(hasInsufficientMaterial('4k3/8/8/8/8/8/8/1N2K3 w - - 0 1', 'white')).toBe(true)
    expect(() => hasInsufficientMaterial('nonsense', 'white')).toThrow()
  })
})
