import type { Speed } from '@chessy/library'

/** "180+2" → "3+2", "60" → "1+0", "15+0" → "¼+0" (minutes + increment seconds, as on lichess). */
export function formatTimeControl(timeControl: string | undefined): string | undefined {
  if (!timeControl) return undefined
  const [initial = '', increment = '0'] = timeControl.split('+')
  const seconds = Number(initial)
  if (!Number.isFinite(seconds)) return timeControl
  const fractions: Record<number, string> = { 15: '¼', 30: '½', 45: '¾' }
  const minutes = fractions[seconds] ?? String(Math.round((seconds / 60) * 10) / 10)
  return `${minutes}+${increment}`
}

export const SPEED_LABELS: Record<Speed, string> = {
  ultrabullet: 'UltraBullet',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  correspondence: 'Correspondence',
}
