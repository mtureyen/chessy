import type { ReviewInput } from '@pawnia/analysis'
import { InMemoryGameRepository } from '@pawnia/library'
import { describe, expect, it } from 'vitest'
import { InMemoryReviewRepository } from '../adapters/inMemoryReviewRepository'
import { sampleReview } from '../testing'
import { ensureReview } from './ensureReview'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('ensureReview', () => {
  it('reviews a line once and keeps the review for next time', async () => {
    const reviews = new InMemoryReviewRepository(new InMemoryGameRepository())
    const inputs: ReviewInput[] = []
    const deps = {
      reviews,
      review: async (input: ReviewInput) => {
        inputs.push(input)
        return sampleReview({ startFen: input.startFen, moves: input.moves }).review
      },
      now: () => new Date('2026-11-05T12:00:00.000Z'),
    }
    const input = { startFen: START, moves: ['e2e4', 'e7e5'], ratings: { white: 800 } }

    const first = await ensureReview(deps, input)
    expect(first.fresh).toBe(true)
    expect(first.stored.reviewedAt).toBe('2026-11-05T12:00:00.000Z')
    expect(await reviews.count()).toBe(1)

    const again = await ensureReview(deps, input)
    expect(again).toEqual({ stored: first.stored, fresh: false })
    expect(inputs).toEqual([input])
  })
})
