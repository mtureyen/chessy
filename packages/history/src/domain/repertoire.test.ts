import { describe, expect, it } from 'vitest'
import { afterReview, newLine, reviewDue } from './repertoire'

const NOW = new Date('2026-11-11T12:00:00.000Z')
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

describe('repertoire reviews', () => {
  it('starts due, then comes back later each time it is passed', () => {
    let progress = newLine(NOW)
    expect(reviewDue(progress, NOW)).toEqual({ due: true })
    const days: number[] = []
    for (let i = 0; i < 8; i++) {
      progress = afterReview(progress, true, NOW)
      days.push(Math.round((new Date(progress.dueAt).getTime() - NOW.getTime()) / 86_400_000))
    }
    expect(days).toEqual([1, 3, 7, 14, 30, 60, 60, 60])
    expect(progress.level).toBe(8)
  })

  it('starts over after a miss, due tomorrow', () => {
    const progress = afterReview({ level: 4, dueAt: NOW.toISOString() }, false, NOW)
    expect(progress).toEqual({ level: 0, dueAt: inDays(1) })
  })

  it('says in how many days a line is due', () => {
    expect(reviewDue({ level: 2, dueAt: inDays(2.5) }, NOW)).toEqual({ due: false, inDays: 3 })
    expect(reviewDue({ level: 2, dueAt: inDays(0.1) }, NOW)).toEqual({ due: false, inDays: 1 })
    expect(reviewDue({ level: 2, dueAt: inDays(-1) }, NOW)).toEqual({ due: true })
  })
})
