import { describe, expect, it } from 'vitest'
import { createClock, flagged, pressClock, remainingMs, stopClock } from './clock'

const THREE_PLUS_TWO = { initialMs: 180_000, incrementMs: 2000 }

describe('clock', () => {
  it('starts only once both sides have moved', () => {
    let clock = createClock(THREE_PLUS_TWO)
    clock = pressClock(clock, 'white', 1, 1000)
    expect(clock.running).toBeUndefined()
    clock = pressClock(clock, 'black', 2, 9000)
    expect(clock.running).toEqual({ color: 'white', since: 9000 })
    expect(remainingMs(clock, 'black', 20_000)).toBe(180_000) // no time used, no increment yet
  })

  it('runs the side to move, then adds the increment when it moves', () => {
    let clock = pressClock(pressClock(createClock(THREE_PLUS_TWO), 'white', 1, 0), 'black', 2, 0)
    expect(remainingMs(clock, 'white', 5000)).toBe(175_000)
    expect(remainingMs(clock, 'black', 5000)).toBe(180_000)
    clock = pressClock(clock, 'white', 3, 5000)
    expect(clock.remaining.white).toBe(177_000)
    expect(clock.running).toEqual({ color: 'black', since: 5000 })
    expect(remainingMs(clock, 'black', 15_000)).toBe(170_000)
  })

  it('flags the running side at zero and never goes negative', () => {
    const clock = pressClock(
      pressClock(createClock({ initialMs: 1000, incrementMs: 0 }), 'white', 1, 0),
      'black',
      2,
      0,
    )
    expect(flagged(clock, 999)).toBeUndefined()
    expect(flagged(clock, 1000)).toBe('white')
    expect(remainingMs(clock, 'white', 5000)).toBe(0)
  })

  it('stops, keeping the time left', () => {
    const running = pressClock(
      pressClock(createClock(THREE_PLUS_TWO), 'white', 1, 0),
      'black',
      2,
      0,
    )
    const stopped = stopClock(running, 30_000)
    expect(stopped.running).toBeUndefined()
    expect(stopped.remaining).toEqual({ white: 150_000, black: 180_000 })
    expect(flagged(stopped, 10_000_000)).toBeUndefined()
  })
})
