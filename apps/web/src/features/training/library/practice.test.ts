import { describe, expect, it } from 'vitest'
import { answersText, bandPlayers } from './practice'

const label = (san: string) => `3...${san}`

describe('answersText', () => {
  it('names the answer played most, with the score of the user’s side', () => {
    const answers = [
      { san: 'dxe4', r: [40, 10, 50] as [number, number, number] },
      { san: 'e6', r: [5, 0, 5] as [number, number, number] },
    ]
    expect(answersText(answers, 'black', '1200-1599', label)).toBe(
      'Players rated 1200–1599 answer most with 3...dxe4 (91%), scoring 55%.',
    )
  })

  it('adds the common answer that scores best, when it is another one', () => {
    const answers = [
      { san: 'dxe4', r: [50, 0, 50] as [number, number, number] },
      { san: 'e6', r: [10, 0, 30] as [number, number, number] },
      // Scores even better, but too rare to tell.
      { san: 'g6', r: [0, 0, 5] as [number, number, number] },
    ]
    expect(answersText(answers, 'black', 'all', label)).toBe(
      'Players of all ratings answer most with 3...dxe4 (69%); 3...e6 scores best (75%).',
    )
  })

  it('has nothing to say without games', () => {
    expect(answersText([], 'white', 'all', label)).toBeUndefined()
    expect(answersText([{ san: 'e6', r: [0, 0, 0] }], 'white', 'all', label)).toBeUndefined()
  })
})

describe('bandPlayers', () => {
  it('names who the numbers are about', () => {
    expect(bandPlayers('under-1200')).toBe('players rated under 1200')
    expect(bandPlayers('2000+')).toBe('players rated 2000+')
  })
})
