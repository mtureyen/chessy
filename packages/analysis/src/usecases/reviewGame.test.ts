import { createGame } from '@chessy/chess'
import { describe, expect, it } from 'vitest'
import { InMemoryEvalCache } from '../adapters/inMemoryEvalCache'
import type { AnalysisRequest, AnalysisSnapshot, EngineLine } from '../domain/analysis'
import { buildBookData, createOpeningBook } from '../domain/review/book'
import { positionKey } from '../domain/review/keys'
import type { EngineProvider } from '../ports/engine'
import {
  reviewGame,
  ReviewCancelledError,
  ReviewEngineError,
  type CancelSignal,
} from './reviewGame'

/** Minimal AbortController (this package's tests run without DOM/Node typings). */
function cancellable() {
  const listeners = new Set<() => void>()
  const signal: CancelSignal & { aborted: boolean } = {
    aborted: false,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  }
  return {
    signal,
    abort() {
      signal.aborted = true
      for (const listener of listeners) listener()
    },
  }
}

type Lines = Array<{ cp?: number; mate?: [winner: 'white' | 'black', moves: number]; pv: string[] }>

/** Engine stand-in answering from a table (keyed by position), defaulting to an equal position. */
function fakeEngine(
  table: Record<string, Lines> = {},
  behaviour: { fail?: string; hang?: boolean } = {},
) {
  const requests: AnalysisRequest[] = []
  const engine: EngineProvider = {
    init: async () => ({ name: 'Fake' }),
    dispose: () => {},
    analyze(request) {
      requests.push(request)
      if (behaviour.hang) {
        let stop!: () => void
        const result = new Promise<AnalysisSnapshot>((resolve) => {
          stop = () => resolve({ fen: request.fen, depth: 0, lines: [], end: 'stopped' })
        })
        return { stop, result }
      }
      const fallbackMove = createGame(request.fen).legalMoves()[0]
      const rows = table[positionKey(request.fen)] ?? [
        { cp: 0, pv: fallbackMove ? [`${fallbackMove.from}${fallbackMove.to}`] : [] },
      ]
      const lines: EngineLine[] = rows.map((row, i) => ({
        rank: i + 1,
        depth: 18,
        // Table rows are written from White's view, like the engine output we store.
        score: row.mate
          ? { type: 'mate', winner: row.mate[0], moves: row.mate[1] }
          : { type: 'cp', value: row.cp ?? 0 },
        pv: row.pv,
      }))
      const snapshot: AnalysisSnapshot = behaviour.fail
        ? { fen: request.fen, depth: 0, lines: [], end: 'error', error: behaviour.fail }
        : { fen: request.fen, depth: 18, lines, end: 'limit' }
      return { stop: () => {}, result: Promise.resolve(snapshot) }
    },
  }
  return { engine, requests }
}

const START = createGame().fen()
const after = (...moves: string[]) => {
  const game = createGame()
  for (const m of moves) game.play(m)
  return positionKey(game.fen())
}

describe('reviewGame', () => {
  it('evaluates every position once, with the node budget and 2 lines', async () => {
    const { engine, requests } = fakeEngine()
    const progress: number[] = []
    const review = await reviewGame(
      { engine, engineName: 'Fake' },
      { startFen: START, moves: ['e2e4', 'e7e5'] },
      { nodes: 1234, onProgress: (done) => progress.push(done) },
    )
    expect(requests).toHaveLength(3)
    expect(requests.every((r) => r.nodes === 1234 && r.multiPv === 2)).toBe(true)
    expect(progress).toEqual([1, 2, 3])
    expect(review.positions).toHaveLength(3)
    expect(review.moves.map((m) => [m.ply, m.san, m.color])).toEqual([
      [1, 'e4', 'white'],
      [2, 'e5', 'black'],
    ])
    expect(review.settings).toEqual({ engine: 'Fake', nodes: 1234 })
  })

  it('classifies a blunder and the best move, from each mover’s view', async () => {
    const { engine } = fakeEngine({
      [positionKey(START)]: [{ cp: 30, pv: ['e2e4'] }],
      [after('e4')]: [{ cp: 30, pv: ['e7e5'] }],
      // 1... f6?? allows a big White advantage.
      [after('e4', 'f6')]: [{ cp: 600, pv: ['d2d4'] }],
    })
    const review = await reviewGame(
      { engine, engineName: 'Fake' },
      { startFen: START, moves: ['e2e4', 'f7f6'] },
      { nodes: 1 },
    )
    const [e4, f6] = review.moves
    expect(e4).toMatchObject({ classification: 'best', accuracy: 100 })
    expect(f6!.classification).toBe('blunder')
    expect(f6!.best).toMatchObject({ uci: 'e7e5', san: 'e5' })
    expect(f6!.winBefore).toBeGreaterThan(f6!.winAfter)
    expect(review.accuracy.white).toBeGreaterThan(review.accuracy.black!)
    expect(review.counts).toEqual({ white: { best: 1 }, black: { blunder: 1 } })
  })

  it('scores checkmate without asking the engine', async () => {
    const { engine, requests } = fakeEngine()
    const review = await reviewGame(
      { engine, engineName: 'Fake' },
      { startFen: START, moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] },
      { nodes: 1 },
    )
    expect(requests).toHaveLength(4)
    expect(review.positions.at(-1)?.score).toEqual({ type: 'mate', winner: 'black', moves: 0 })
    expect(review.positions.at(-1)?.whiteWin).toBeLessThan(3)
  })

  it('marks book moves while the game stays in theory', async () => {
    const book = createOpeningBook(
      buildBookData([{ eco: 'C60', name: 'Ruy Lopez', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5' }]),
    )
    const { engine } = fakeEngine()
    const review = await reviewGame(
      { engine, engineName: 'Fake', book },
      { startFen: START, moves: ['e2e4', 'e7e5', 'g1f3', 'a7a6', 'f1b5'] },
      { nodes: 1 },
    )
    expect(review.moves.map((m) => m.classification === 'book')).toEqual([
      true,
      true,
      true,
      false,
      false,
    ])
  })

  it('recognises a sound piece sacrifice as brilliant', async () => {
    // Greek gift: Bxh7+ Kxh7 Ng5+ gives up a bishop for a pawn but keeps White better.
    const fen = 'rnbq1rk1/pppn1ppp/4p3/3pP3/3P4/3B1N2/PPP2PPP/RNBQK2R w KQ - 0 7'
    const sac = createGame(fen)
    sac.play('d3h7')
    const { engine } = fakeEngine({
      [positionKey(fen)]: [
        { cp: 120, pv: ['d3h7'] },
        { cp: 40, pv: ['e1g1'] },
      ],
      [positionKey(sac.fen())]: [{ cp: 140, pv: ['g8h7', 'f3g5'] }],
    })
    const review = await reviewGame(
      { engine, engineName: 'Fake' },
      { startFen: fen, moves: ['d3h7'] },
      { nodes: 1 },
    )
    expect(review.moves[0]?.classification).toBe('brilliant')
  })

  it('reuses cached evaluations', async () => {
    const cache = new InMemoryEvalCache()
    const first = fakeEngine()
    await reviewGame(
      { engine: first.engine, engineName: 'Fake', cache },
      { startFen: START, moves: ['e2e4'] },
      { nodes: 5 },
    )
    const second = fakeEngine()
    await reviewGame(
      { engine: second.engine, engineName: 'Fake', cache },
      { startFen: START, moves: ['e2e4'] },
      { nodes: 5 },
    )
    expect(second.requests).toHaveLength(0)

    const deeper = fakeEngine()
    await reviewGame(
      { engine: deeper.engine, engineName: 'Fake', cache },
      { startFen: START, moves: ['e2e4'] },
      { nodes: 50 },
    )
    expect(deeper.requests).toHaveLength(2) // other node budget → other cache entries
  })

  it('can be cancelled while the engine is thinking', async () => {
    const { engine } = fakeEngine({}, { hang: true })
    const controller = cancellable()
    const running = reviewGame(
      { engine, engineName: 'Fake' },
      { startFen: START, moves: ['e2e4'] },
      {
        nodes: 1,
        signal: controller.signal,
      },
    )
    controller.abort()
    await expect(running).rejects.toBeInstanceOf(ReviewCancelledError)
  })

  it('reports engine failures', async () => {
    const { engine } = fakeEngine({}, { fail: 'wasm crashed' })
    await expect(
      reviewGame(
        { engine, engineName: 'Fake' },
        { startFen: START, moves: ['e2e4'] },
        { nodes: 1 },
      ),
    ).rejects.toThrow(ReviewEngineError)
  })
})
