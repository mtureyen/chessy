import type { Speed } from '@pawnia/library'
import type { TimeControl } from './clock'

export interface TimeControlPreset {
  /** "5+3": minutes + increment in seconds. */
  label: string
  control: TimeControl
}

const preset = (minutes: number, incrementSeconds: number): TimeControlPreset => ({
  label: `${minutes}+${incrementSeconds}`,
  control: { initialMs: minutes * 60_000, incrementMs: incrementSeconds * 1000 },
})

export const TIME_CONTROLS: readonly TimeControlPreset[] = [
  preset(1, 0),
  preset(3, 2),
  preset(5, 3),
  preset(10, 0),
  preset(15, 10),
  preset(30, 0),
]

/** lichess' speed categories by estimated game duration: initial time + 40 × increment. */
export function speedOf({ initialMs, incrementMs }: TimeControl): Speed {
  const seconds = (initialMs + 40 * incrementMs) / 1000
  if (seconds < 29) return 'ultrabullet'
  if (seconds < 179) return 'bullet'
  if (seconds < 479) return 'blitz'
  if (seconds < 1499) return 'rapid'
  return 'classical'
}

/** PGN TimeControl tag: "300+3" (seconds + increment seconds). */
export function pgnTimeControl({ initialMs, incrementMs }: TimeControl): string {
  return `${initialMs / 1000}+${incrementMs / 1000}`
}

/** The inverse of pgnTimeControl: "300+3" → 5 minutes + 3 seconds; undefined for anything else. */
export function parsePgnTimeControl(tag: string | undefined): TimeControl | undefined {
  const match = /^(\d+)\+(\d+)$/.exec(tag ?? '')
  if (!match) return undefined
  return { initialMs: Number(match[1]) * 1000, incrementMs: Number(match[2]) * 1000 }
}
