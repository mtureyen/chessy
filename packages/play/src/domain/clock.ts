import type { Color } from '@pawnia/chess'

/** Base time and increment per move. */
export interface TimeControl {
  initialMs: number
  incrementMs: number
}

export interface ClockState {
  readonly control: TimeControl
  /** Time left per side; for the running side as of `running.since`. */
  readonly remaining: Readonly<Record<Color, number>>
  /** The side whose time runs, since when (ms). Unset before the clock starts and once it stops. */
  readonly running?: { readonly color: Color; readonly since: number }
}

export function createClock(control: TimeControl): ClockState {
  return { control, remaining: { white: control.initialMs, black: control.initialMs } }
}

/**
 * `mover` made the move that reached `ply` at `now`: their time stops (plus the increment) and
 * the opponent's starts. As on lichess, the clocks only start once both sides have moved.
 */
export function pressClock(clock: ClockState, mover: Color, ply: number, now: number): ClockState {
  const remaining = { ...clock.remaining }
  if (clock.running?.color === mover) {
    remaining[mover] = remainingMs(clock, mover, now) + clock.control.incrementMs
  }
  if (ply < 2) return { control: clock.control, remaining }
  return { control: clock.control, remaining, running: { color: opponent(mover), since: now } }
}

/** Stops the clock (game over), keeping the time each side had left. */
export function stopClock(clock: ClockState, now: number): ClockState {
  const remaining = {
    white: remainingMs(clock, 'white', now),
    black: remainingMs(clock, 'black', now),
  }
  return { control: clock.control, remaining }
}

export function remainingMs(clock: ClockState, color: Color, now: number): number {
  const left = clock.remaining[color]
  if (clock.running?.color !== color) return left
  return Math.max(0, left - (now - clock.running.since))
}

/** The side whose time has run out, if any. */
export function flagged(clock: ClockState, now: number): Color | undefined {
  const running = clock.running?.color
  return running && remainingMs(clock, running, now) <= 0 ? running : undefined
}

function opponent(color: Color): Color {
  return color === 'white' ? 'black' : 'white'
}
