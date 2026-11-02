import { describe, expect, it } from 'vitest'
import { pgnTimeControl, speedOf, TIME_CONTROLS } from './timeControl'

const tc = (minutes: number, increment: number) => ({
  initialMs: minutes * 60_000,
  incrementMs: increment * 1000,
})

describe('time controls', () => {
  it('sorts into lichess speed categories', () => {
    expect(speedOf(tc(0.25, 0))).toBe('ultrabullet')
    expect(speedOf(tc(1, 0))).toBe('bullet')
    expect(speedOf(tc(2, 1))).toBe('bullet')
    expect(speedOf(tc(3, 2))).toBe('blitz')
    expect(speedOf(tc(5, 3))).toBe('blitz')
    expect(speedOf(tc(10, 0))).toBe('rapid')
    expect(speedOf(tc(15, 10))).toBe('rapid')
    expect(speedOf(tc(30, 0))).toBe('classical')
  })

  it('writes the PGN tag in seconds and labels presets in minutes', () => {
    expect(pgnTimeControl(tc(5, 3))).toBe('300+3')
    expect(TIME_CONTROLS.map((p) => p.label)).toContain('5+3')
  })
})
