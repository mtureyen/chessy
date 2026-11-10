import { describe, expect, it } from 'vitest'
import { departureText, moveText, openingLabel, theoryText } from './format'

describe('openings format', () => {
  it('names the opening from the player’s side', () => {
    expect(openingLabel('Vienna Game', 'white')).toBe('Vienna Game')
    expect(openingLabel('Caro Kann Defense', 'white')).toBe('against the Caro Kann Defense')
    expect(openingLabel('Sicilian Defense', 'black')).toBe('Sicilian Defense')
    expect(openingLabel('Vienna Game', 'black')).toBe('against the Vienna Game')
  })

  it('writes what theory had, with move numbers', () => {
    expect(theoryText(['e4', 'e5', 'Nc3', 'Bb4', 'd3'], ['Qg4', 'Na4'])).toBe('3.Qg4 or 3.Na4')
    expect(theoryText(['e4', 'e5', 'Nc3', 'Nc6', 'd3', 'Bc5'], ['Nf6'])).toBe('3…Nf6')
    expect(
      theoryText(['e4', 'e5', 'Nc3', 'Nc6', 'Bb5'], ['Bc4', 'Nf3', 'd3', 'd4', 'f4', 'g3']),
    ).toBe('3.Bc4, 3.Nf3, 3.d3 or 3.d4 (+2 more)')
  })

  it('numbers a move by its half-move', () => {
    expect(moveText(5, 'd3')).toBe('3.d3')
    expect(moveText(6, 'Bc5')).toBe('3…Bc5')
  })

  it('says who leaves theory', () => {
    expect(departureText({ you: 30, them: 29, none: 4, youAt: 3 })).toBe(
      'you leave theory first in 30 of 63, usually at move 3',
    )
    expect(departureText({ you: 0, them: 9, none: 0 })).toBe(
      'your opponents leave theory first in 9 of 9',
    )
    expect(departureText({ you: 0, them: 0, none: 2 })).toBe(
      '2 of 2 stay in theory as far as the book goes',
    )
  })
})
