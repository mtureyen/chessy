import { EngineFailedError, EvaluationCancelledError, type ReviewInput } from '@pawnia/analysis'
import { gameLine, lineText, type GameSummary, type StoredReview } from '@pawnia/history'
import { sampleReview, sampleSummary } from '@pawnia/history/testing'
import { buildProfile } from '@pawnia/library'
import { sampleGame } from '@pawnia/library/testing'
import { describe, expect, it } from 'vitest'
import { ReviewQueue, type ReviewJob, type ReviewQueueDeps } from './reviewQueue'
import { ReviewQueueBusyError } from './reviewQueueService'

const profile = buildProfile(
  { accounts: [{ source: 'chesscom', username: '8sly' }] },
  { id: 'p', now: '2026-11-05T00:00:00.000Z' },
)

/** One game per id, each with moves of its own, played by the user; the newest first. */
function setup(ids: string[], options: { reviewed?: string[]; job?: ReviewJob } = {}) {
  const pgnOf = (id: string) => `[Event "${id}"]\n\n1. a3 a6 2. ${'abcdefgh'[ids.indexOf(id)]}4 *`
  const summaries: GameSummary[] = ids.map((id) =>
    sampleSummary({ id, reviewed: options.reviewed?.includes(id) ?? false }),
  )
  const stored = new Map<string, StoredReview>()
  const reviewed: string[] = []
  const jobs: (ReviewJob | undefined)[] = []
  /** What each review does: finish, or wait for `release`. */
  const gate: { hold?: Promise<void>; fail?: (id: string) => Error | undefined } = {}
  const idOf = (input: ReviewInput) =>
    ids.find((id) => lineText(gameLine(pgnOf(id))) === lineText(input))!
  const deps: ReviewQueueDeps = {
    library: {
      summaries: async () => summaries,
      profile: async () => profile,
      game: async (id) => sampleGame({ id, pgn: pgnOf(id) }),
    },
    reviews: {
      find: async (line) => stored.get(lineText(line)),
      save: async (review) => void stored.set(lineText(review.line), review),
    },
    review: async (input, { signal }) => {
      const id = idOf(input)
      const failure = gate.fail?.(id)
      if (failure) throw failure
      await gate.hold
      if (signal.aborted) throw new EvaluationCancelledError()
      reviewed.push(id)
      return sampleReview({ startFen: input.startFen, moves: input.moves }).review
    },
    store: {
      load: async () => options.job,
      save: async (job) => void jobs.push(job),
    },
  }
  return { queue: new ReviewQueue(deps), reviewed, jobs, gate, deps }
}

async function finished(queue: ReviewQueue) {
  await expect.poll(() => queue.status().status).not.toBe('running')
  return queue.status()
}

describe('ReviewQueue', () => {
  it('reviews the last games newest first; games with a review count as done', async () => {
    const { queue, reviewed, jobs } = setup(['a', 'b', 'c', 'd'], { reviewed: ['b'] })
    expect(await queue.start({ count: 3 })).toMatchObject({ status: 'running', total: 3, done: 1 })
    expect(await finished(queue)).toEqual({ status: 'finished', total: 3, done: 3, failed: 0 })
    expect(reviewed).toEqual(['a', 'c'])
    expect(jobs).toEqual([{ gameIds: ['a', 'b', 'c'], paused: false }, undefined])
  })

  it('refuses a second run while one is going on', async () => {
    const { queue, gate } = setup(['a'])
    let release = () => {}
    gate.hold = new Promise((resolve) => (release = resolve))
    await queue.start({ count: 1 })
    await expect(queue.start({ count: 1 })).rejects.toBeInstanceOf(ReviewQueueBusyError)
    release()
    await finished(queue)
  })

  it('pauses inside a game and reviews that game again on resume', async () => {
    const { queue, reviewed, gate, jobs } = setup(['a', 'b'])
    let release = () => {}
    gate.hold = new Promise((resolve) => (release = resolve))
    await queue.start({ count: 2 })
    const paused = queue.pause()
    release()
    expect(await paused).toMatchObject({ status: 'paused', done: 0 })
    expect(jobs.at(-1)).toEqual({ gameIds: ['a', 'b'], paused: true })

    gate.hold = undefined
    await queue.resume()
    expect(await finished(queue)).toMatchObject({ status: 'finished', done: 2 })
    expect(reviewed).toEqual(['a', 'b'])
  })

  it('skips a game it cannot review, but stops without an engine', async () => {
    const skipping = setup(['a', 'b'])
    skipping.gate.fail = (id) => (id === 'a' ? new Error('bad game') : undefined)
    await skipping.queue.start({ count: 2 })
    expect(await finished(skipping.queue)).toMatchObject({
      status: 'finished',
      done: 1,
      failed: 1,
    })

    const stopped = setup(['a', 'b'])
    stopped.gate.fail = () => new EngineFailedError('no engine on this server')
    await stopped.queue.start({ count: 2 })
    expect(await finished(stopped.queue)).toMatchObject({
      status: 'failed',
      done: 0,
      reason: 'no engine on this server',
    })
  })

  it('comes back to an interrupted run after a restart; a paused one stays paused', async () => {
    const running = setup(['a', 'b'], {
      reviewed: ['a'],
      job: { gameIds: ['a', 'b'], paused: false },
    })
    await running.queue.restore()
    expect(await finished(running.queue)).toMatchObject({ status: 'finished', total: 2, done: 2 })
    expect(running.reviewed).toEqual(['b'])

    const paused = setup(['a', 'b'], { job: { gameIds: ['a', 'b'], paused: true } })
    await paused.queue.restore()
    expect(paused.queue.status()).toMatchObject({ status: 'paused', total: 2, done: 0 })
    expect(paused.reviewed).toEqual([])

    const nothing = setup(['a'])
    await nothing.queue.restore()
    expect(nothing.queue.status().status).toBe('idle')
  })

  it('reports a failed start and stays as it was', async () => {
    const { queue, deps } = setup(['a'])
    deps.library.summaries = async () => {
      throw new Error('No database configured (DATABASE_URL)')
    }
    await expect(queue.start({ count: 1 })).rejects.toThrow(/DATABASE_URL/)
    expect(queue.status().status).toBe('idle')
  })
})
