import type { Color } from '@chessy/chess'
import { remainingMs, type ClockState } from '@chessy/play'
import { useEffect, useState } from 'react'
import { formatClock } from '@/shared/game/clock'

/** Below this the clock turns red. */
const LOW_TIME_MS = 20_000

/** One side's clock. Re-renders itself while that side's time runs, so the page doesn't have to. */
export function ClockFace({ clock, color }: { clock: ClockState; color: Color }) {
  const running = clock.running?.color === color
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(timer)
  }, [running])

  // A stopped clock shows its stored time; a running one counts down from when it started.
  const left = remainingMs(clock, color, running ? Math.max(now, clock.running!.since) : 0)
  const classes = [
    'bot-clock',
    running && 'bot-clock-running',
    left < LOW_TIME_MS && 'bot-clock-low',
  ]
  return (
    <span className={classes.filter(Boolean).join(' ')} role="timer" aria-label={`${color} clock`}>
      {formatClock(left / 1000)}
    </span>
  )
}
