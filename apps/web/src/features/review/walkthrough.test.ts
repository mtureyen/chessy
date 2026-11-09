import type { GameReview, ReviewedMove } from '@pawnia/analysis'
import type { CoachWalkthroughBody } from '@pawnia/contracts'
import { describe, expect, it } from 'vitest'
import { momentDrawing, walkthroughSteps } from './walkthrough'

const move = (ply: number, overrides: Partial<ReviewedMove> = {}) =>
  ({ ply, uci: 'e2e4', classification: 'best', ...overrides }) as ReviewedMove

const review = {
  positions: [{ fen: 'before' }, { fen: 'after' }],
  moves: [
    move(1, {
      classification: 'blunder',
      best: { uci: 'g1f3', san: 'Nf3', line: ['g1f3'] },
    }),
  ],
} as unknown as GameReview

const written: CoachWalkthroughBody = {
  summary: 'A short game.',
  opening: { name: 'Vienna Game', ply: 3, text: 'The Vienna.' },
  moments: [
    { ply: 1, what: 'It went wrong.', better: 'Nf3 develops.' },
    { ply: 9, what: 'No such move in this review.' },
  ],
  focus: 'Develop.',
  agent: 'Test',
  writtenAt: '2026-11-06T12:00:00.000Z',
}

describe('walkthroughSteps', () => {
  it('goes from the summary over the opening and the moments to what to work on', () => {
    const steps = walkthroughSteps(written, review)
    expect(steps.map((step) => step.kind)).toEqual(['summary', 'opening', 'moment', 'focus'])
    const { opening: _, ...noOpening } = written
    expect(walkthroughSteps(noOpening, review).map((step) => step.kind)).toEqual([
      'summary',
      'moment',
      'focus',
    ])
  })
})

describe('momentDrawing', () => {
  const blunder = review.moves[0]!

  it('shows the move played on the position before it, the better one only when revealed', () => {
    expect(momentDrawing(blunder, review, false)).toEqual({
      fen: 'before',
      arrows: [{ from: 'e2', to: 'e4', color: 'red' }],
      squares: [],
    })
    expect(momentDrawing(blunder, review, true)?.arrows).toEqual([
      { from: 'e2', to: 'e4', color: 'red' },
      { from: 'g1', to: 'f3', color: 'green' },
    ])
  })

  it('shows a good move in green, once', () => {
    const great = move(1, {
      classification: 'great',
      best: { uci: 'e2e4', san: 'e4', line: ['e2e4'] },
    })
    expect(momentDrawing(great, review, true)?.arrows).toEqual([
      { from: 'e2', to: 'e4', color: 'green' },
    ])
  })

  it('has nothing to show without the position', () => {
    expect(momentDrawing(move(5), review, false)).toBeUndefined()
  })
})
