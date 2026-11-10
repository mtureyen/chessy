import { describe, expect, it } from 'vitest'
import { nextMoves, pickReply } from './practice'

const tally = (games: number) => ({ games, wins: 0, draws: 0, losses: 0, unfinished: 0 })
const line = (moves: string, games: number) => ({
  moves: moves.split(' '),
  tally: tally(games),
  book: true,
  yours: false,
})

describe('practice', () => {
  const table = nextMoves([
    line('e4', 10),
    line('e4 e5', 8),
    line('e4 c5', 2),
    line('e4 e5 Nc3', 8),
  ])

  it('knows what the games went on with from each position', () => {
    expect(table.get('')).toEqual([{ san: 'e4', games: 10 }])
    expect(table.get('e4')).toEqual([
      { san: 'e5', games: 8 },
      { san: 'c5', games: 2 },
    ])
    expect(table.get('e4 e5 Nc3')).toBeUndefined()
  })

  it('picks the replies met by how often, else theory’s', () => {
    expect(pickReply(table.get('e4'), [], () => 0.5)).toBe('e5') // 5 of 10: inside e5's 8
    expect(pickReply(table.get('e4'), [], () => 0.85)).toBe('c5') // 8.5 of 10: c5's 2
    expect(pickReply(undefined, ['Nf6', 'Nc6'], () => 0.6)).toBe('Nc6')
    expect(pickReply([], [], () => 0.1)).toBeUndefined()
  })
})
