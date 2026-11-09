import type { GameReview, ReviewedMove } from '@pawnia/analysis'
import { createGame } from '@pawnia/chess'
import { describe, expect, it } from 'vitest'
import { fitsMainline, mainline, reviewedNodes, reviewLine } from './mapping'

function reviewOf(startFen: string, ucis: string[]): GameReview {
  return {
    startFen,
    positions: [],
    moves: ucis.map((uci, i) => ({ uci, ply: i + 1, classification: 'best' }) as ReviewedMove),
    accuracy: {},
    counts: { white: {}, black: {} },
    settings: { engine: 'x', nodes: 1 },
  }
}

describe('reviewedNodes', () => {
  it('pairs main-line nodes with reviewed moves', () => {
    const game = createGame()
    for (const m of ['e4', 'e5', 'Nf3']) game.play(m)
    const map = reviewedNodes(game.root, reviewOf(game.root.fen, ['e2e4', 'e7e5', 'g1f3']))
    expect(mainline(game.root).map((n) => map.get(n.id)?.ply)).toEqual([1, 2, 3])
  })

  it('stops where the main line diverges from the reviewed game', () => {
    const game = createGame()
    for (const m of ['e4', 'e5', 'Nf3']) game.play(m)
    const map = reviewedNodes(game.root, reviewOf(game.root.fen, ['e2e4', 'c7c5', 'g1f3']))
    expect(map.size).toBe(1)
  })

  it('matches nothing for another starting position', () => {
    const game = createGame()
    game.play('e4')
    expect(reviewedNodes(game.root, reviewOf('8/8/8/8/8/8/8/K6k w - - 0 1', ['e2e4'])).size).toBe(0)
  })
})

describe('reviewLine', () => {
  it('is the main line, whatever variations there are', () => {
    const game = createGame()
    for (const m of ['e4', 'e5']) game.play(m)
    game.back()
    game.play('c5')
    expect(reviewLine(game.root)).toEqual({ startFen: game.root.fen, moves: ['e2e4', 'e7e5'] })
  })
})

describe('fitsMainline', () => {
  it('holds while the main line starts with the reviewed moves', () => {
    const game = createGame()
    for (const m of ['e4', 'e5', 'Nf3']) game.play(m)
    expect(fitsMainline(game.root, reviewOf(game.root.fen, ['e2e4', 'e7e5']))).toBe(true)
    expect(fitsMainline(game.root, reviewOf(game.root.fen, ['e2e4', 'c7c5']))).toBe(false)
    const longer = ['e2e4', 'e7e5', 'g1f3', 'b8c6']
    expect(fitsMainline(game.root, reviewOf(game.root.fen, longer))).toBe(false)
  })
})
