import type { Color } from '@chessy/chess'

/**
 * Accuracy of one move from the mover's winning chances before and after it (0–100).
 * Port of lichess' AccuracyPercent.fromWinPercents, including its +1 "uncertainty bonus".
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100
  const raw =
    103.1668100711649 * Math.exp(-0.04354415386753951 * (winBefore - winAfter)) - 3.166924740191411
  return Math.min(100, Math.max(0, raw + 1))
}

/**
 * Game accuracy per side, port of lichess' AccuracyPercent.gameAccuracy: the average of a
 * volatility-weighted mean and the harmonic mean of the side's move accuracies.
 *
 * @param whiteWinPercents White's winning chance for every position, starting position included
 * @param startColor the side that made the first move
 */
export function gameAccuracy(
  whiteWinPercents: readonly number[],
  startColor: Color = 'white',
): Partial<Record<Color, number>> {
  const n = whiteWinPercents.length
  const windowSize = clamp(Math.floor((n - 1) / 10), 2, 8)
  const first = whiteWinPercents.slice(0, windowSize)
  const windows: number[][] = Array.from(
    { length: Math.max(0, Math.min(windowSize, n) - 2) },
    () => first,
  )
  for (let i = 0; i + windowSize <= n; i++) windows.push(whiteWinPercents.slice(i, i + windowSize))
  const weights = windows.map((w) => clamp(standardDeviation(w), 0.5, 12))

  const moves: Record<Color, { accuracy: number; weight: number }[]> = { white: [], black: [] }
  for (let i = 0; i + 1 < n && i < weights.length; i++) {
    const color: Color = (i % 2 === 0) === (startColor === 'white') ? 'white' : 'black'
    const prev = whiteWinPercents[i]!
    const next = whiteWinPercents[i + 1]!
    const accuracy =
      color === 'white' ? moveAccuracy(prev, next) : moveAccuracy(100 - prev, 100 - next)
    moves[color].push({ accuracy, weight: weights[i]! })
  }

  const result: Partial<Record<Color, number>> = {}
  for (const color of ['white', 'black'] as const) {
    const list = moves[color]
    if (list.length === 0) continue
    const weighted =
      list.reduce((sum, m) => sum + m.accuracy * m.weight, 0) /
      list.reduce((sum, m) => sum + m.weight, 0)
    const harmonic = list.length / list.reduce((sum, m) => sum + 1 / Math.max(1, m.accuracy), 0)
    result[color] = (weighted + harmonic) / 2
  }
  return result
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Population standard deviation (as in scalalib Maths.standardDeviation). */
function standardDeviation(values: readonly number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length)
}
