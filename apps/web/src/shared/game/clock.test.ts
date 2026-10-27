import { importPgn } from '@chessy/chess'
import { describe, expect, it } from 'vitest'
import { clockAt, formatClock } from './clock'

describe('formatClock', () => {
  it.each([
    [3605, '1:00:05'],
    [299, '4:59'],
    [60, '1:00'],
    [10, '0:10'],
    [9.94, '0:09.9'],
    [4.1, '0:04.1'],
    [0, '0:00.0'],
  ])('%s s → %s', (seconds, text) => {
    expect(formatClock(seconds)).toBe(text)
  })
})

describe('clockAt', () => {
  it('finds each side’s latest clock at a position', () => {
    const { game } = importPgn(
      '1. e4 { [%clk 0:03:00] } e5 { [%clk 0:02:58] } 2. Nf3 { [%clk 0:02:55] } Nc6 *',
    )
    const [e4, e5, nf3, nc6] = game.line()
    expect(clockAt(game.root, 'white')).toBeUndefined()
    expect(clockAt(e4!, 'white')).toBe(180)
    expect(clockAt(e4!, 'black')).toBeUndefined()
    expect(clockAt(nf3!, 'black')).toBe(178)
    expect(clockAt(nc6!, 'black')).toBe(178) // Nc6 has no clock: fall back to the previous one
    expect(clockAt(e5!, 'white')).toBe(180)
  })
})
