import { describe, expect, it } from 'vitest'
import { gamesText, percents, results, scoreOf, trapText } from './format'

const stats = {
  'under-1200': [10, 0, 5] as [number, number, number],
  '1200-1599': [20, 5, 15] as [number, number, number],
  '1600-1999': [0, 0, 0] as [number, number, number],
  '2000+': [3, 4, 3] as [number, number, number],
}

describe('library format', () => {
  it('sums the bands, or takes one', () => {
    expect(results(stats, 'all')).toEqual([33, 9, 23])
    expect(results(stats, '2000+')).toEqual([3, 4, 3])
  })

  it('writes the results as percent adding up to 100', () => {
    expect(percents([1, 1, 1])).toEqual([34, 33, 33])
    expect(percents([0, 0, 0])).toEqual([0, 0, 0])
    expect(scoreOf([3, 4, 3], 'black')).toBe(50)
    expect(scoreOf([0, 0, 0], 'white')).toBeUndefined()
  })

  it('shortens game counts', () => {
    expect(gamesText(940)).toBe('940')
    expect(gamesText(1234)).toBe('1.2k')
    expect(gamesText(123_456)).toBe('123k')
  })

  it('tells a trap in a sentence', () => {
    expect(
      trapText({
        moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+',
        trapper: 'white',
        yours: true,
        bait: 'Ke8',
        baitShare: 36,
        trapperScore: 78,
        games: 900,
        loss: 20,
        punish: '8. Bxd5',
      }),
    ).toBe(
      'After 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Ng5 d5 5.exd5 Nxd5 6.Nxf7 Kxf7 7.Qf3+, 36% of Black players under 1600 play Ke8. White then scores 78%.',
    )
  })
})
