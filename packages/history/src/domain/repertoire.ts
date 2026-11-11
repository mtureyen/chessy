/** Where a repertoire line stands in its reviews. */
export interface ReviewProgress {
  /** Reviews passed in a row (all the user's moves right at the first try). */
  level: number
  /** ISO timestamp: when it is due next. */
  dueAt: string
}

/** Days until the next review after passing it this many times in a row (then stays at the last). */
export const REVIEW_DAYS = [1, 3, 7, 14, 30, 60] as const

const DAY_MS = 86_400_000

/** A line just added: due now, to be played once. */
export function newLine(now: Date): ReviewProgress {
  return { level: 0, dueAt: now.toISOString() }
}

/**
 * After a review: passed (every move right at the first try), it comes back later each time
 * (1, 3, 7, 14, 30, then every 60 days); missed, it comes back tomorrow and starts over.
 */
export function afterReview(progress: ReviewProgress, passed: boolean, now: Date): ReviewProgress {
  if (!passed) return { level: 0, dueAt: new Date(now.getTime() + DAY_MS).toISOString() }
  const days = REVIEW_DAYS[Math.min(progress.level, REVIEW_DAYS.length - 1)]!
  return { level: progress.level + 1, dueAt: new Date(now.getTime() + days * DAY_MS).toISOString() }
}

/** Whether a line is due, and if not, in how many whole days (at least 1). */
export function reviewDue(
  progress: ReviewProgress,
  now: Date,
): { due: true } | { due: false; inDays: number } {
  const wait = new Date(progress.dueAt).getTime() - now.getTime()
  return wait <= 0 ? { due: true } : { due: false, inDays: Math.max(1, Math.ceil(wait / DAY_MS)) }
}
