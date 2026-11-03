import { describe, expect, it } from 'vitest'
import { MOVE_COUNT, moveIndex, mirrorMove } from '../domain/encoding'
import type { MaiaInput, MaiaModel } from '../ports/maiaModel'
import { moveProbabilities, predictHumanMoves } from './predictHumanMoves'

/** Favours one move (given from White's side) and records what it was asked. */
function fakeModel(favourite: string) {
  const calls: MaiaInput[][] = []
  const model: MaiaModel = {
    async run(inputs) {
      calls.push([...inputs])
      return inputs.map(() => {
        const logits = new Float32Array(MOVE_COUNT)
        logits[moveIndex(favourite)!] = 10
        return { logits, value: new Float32Array([0, 0, 1]) }
      })
    },
  }
  return { model, calls }
}

describe('predictHumanMoves', () => {
  it('runs one batch and maps moves back for Black', async () => {
    const { model, calls } = fakeModel('e2e4')
    const [white, black] = await predictHumanMoves(model, [
      {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        eloSelf: 1500,
        eloOppo: 1700,
      },
      { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', eloSelf: 1200 },
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.map((c) => [c.eloSelf, c.eloOppo])).toEqual([
      [1500, 1700],
      [1200, 1200],
    ])
    expect(white!.moves[0]!.move).toBe('e2e4')
    expect(black!.moves[0]!.move).toBe(mirrorMove('e2e4')) // e7e5 for Black
  })

  it('skips positions without legal moves', async () => {
    const { model, calls } = fakeModel('e2e4')
    const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
    const [result] = await predictHumanMoves(model, [{ fen: mated, eloSelf: 1500 }])
    expect(result!.moves).toEqual([])
    expect(calls[0]).toEqual([])
  })
})

describe('moveProbabilities', () => {
  it('reads the probability of the given move, 0 for an illegal one', async () => {
    const { model } = fakeModel('e2e4')
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const [likely, unlikely, illegal] = await moveProbabilities(model, [
      { fen: start, move: 'e2e4', eloSelf: 1500 },
      { fen: start, move: 'a2a3', eloSelf: 1500 },
      { fen: start, move: 'e2e5', eloSelf: 1500 },
    ])
    expect(likely).toBeGreaterThan(0.99)
    expect(unlikely).toBeGreaterThan(0)
    expect(unlikely).toBeLessThan(0.01)
    expect(illegal).toBe(0)
  })
})
