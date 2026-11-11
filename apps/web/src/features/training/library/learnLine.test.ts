import { describe, expect, it } from 'vitest'
import { sameMove, yourPlies } from './learnLine'

describe('learning a line', () => {
  it('knows which moves are the user’s', () => {
    const line = ['e4', 'c6', 'd4', 'd5', 'e5']
    expect(yourPlies(line, 'white')).toEqual([1, 3, 5])
    expect(yourPlies(line, 'black')).toEqual([2, 4])
  })

  it('compares moves without check marks', () => {
    expect(sameMove('Qf3+', 'Qf3')).toBe(true)
    expect(sameMove('Bb5', 'Bb5+')).toBe(true)
    expect(sameMove('Nf3', 'Nc3')).toBe(false)
  })
})
