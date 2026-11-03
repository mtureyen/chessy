import { describe, expect, it } from 'vitest'
import { appearanceVariables, DEFAULT_APPEARANCE, parseAppearance, pieceUrl } from './appearance'

describe('parseAppearance', () => {
  it('keeps a valid stored appearance', () => {
    const stored = { theme: 'blue', pieces: 'merida', coordinates: false }
    expect(parseAppearance(stored)).toEqual(stored)
  })

  it('falls back to the default for missing or unknown values', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE)
    expect(parseAppearance('green')).toEqual(DEFAULT_APPEARANCE)
    expect(parseAppearance({ theme: 'neon', pieces: 'toString', coordinates: 'yes' })).toEqual(
      DEFAULT_APPEARANCE,
    )
    expect(parseAppearance({ pieces: 'pixel' })).toEqual({ ...DEFAULT_APPEARANCE, pieces: 'pixel' })
  })
})

describe('appearanceVariables', () => {
  it('sets the square colours and one image per piece', () => {
    const variables = appearanceVariables({ theme: 'brown', pieces: 'merida', coordinates: true })
    expect(variables['--board-light']).toBe('#f0d9b5')
    expect(variables['--board-dark']).toBe('#b58863')
    expect(Object.keys(variables).filter((name) => name.startsWith('--piece-'))).toHaveLength(12)
    expect(variables['--piece-black-knight']).toBe('url("/pieces/merida/bN.svg")')
  })

  it('serves pieces under the app base path', () => {
    expect(pieceUrl('cburnett', 'white', 'king', '/chessy/')).toBe('/chessy/pieces/cburnett/wK.svg')
  })
})
