import {
  EngineFailedError,
  type AnalysisRequest,
  type AnalysisSnapshot,
  type CancelSignal,
  type EngineProvider,
} from '@chessy/analysis'
import { describe, expect, it } from 'vitest'
import { botLevel } from '../domain/levels'
import { seededRandom } from '../domain/random'
import { BotMoveCancelledError, chooseBotMove } from './chooseBotMove'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MATED = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'

/** Answers every search with `answer`, or holds it until stopped when `answer` is 'hold'. */
function fakeEngine(answer: Partial<AnalysisSnapshot> | 'hold') {
  const requests: AnalysisRequest[] = []
  const engine: EngineProvider = {
    init: async () => ({ name: 'Fake' }),
    dispose: () => {},
    analyze(request) {
      requests.push(request)
      let resolve!: (s: AnalysisSnapshot) => void
      const result = new Promise<AnalysisSnapshot>((r) => (resolve = r))
      if (answer !== 'hold')
        resolve({ fen: request.fen, depth: 10, lines: [], end: 'limit', ...answer })
      return {
        result,
        stop: () => resolve({ fen: request.fen, depth: 0, lines: [], end: 'stopped' }),
      }
    },
  }
  return { engine, requests }
}

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

const request = { fen: START, level: botLevel(5), random: seededRandom(1) }

describe('chooseBotMove', () => {
  it('asks for the level’s budget and candidates, then picks from the lines', async () => {
    const { engine, requests } = fakeEngine({
      lines: [{ rank: 1, depth: 10, score: { type: 'cp', value: 30 }, pv: ['e2e4'] }],
    })
    const choice = await chooseBotMove({ engine }, request)
    expect(choice.move).toBe('e2e4')
    expect(requests).toEqual([{ fen: START, nodes: 80_000, multiPv: 5, fresh: true }])
  })

  it('searches less when the bot is low on time', async () => {
    const { engine, requests } = fakeEngine({ bestMove: 'e2e4' })
    await chooseBotMove({ engine }, { ...request, level: botLevel(8), remainingMs: 3000 })
    expect(requests[0]!.nodes).toBeLessThan(botLevel(8).nodes)
  })

  it('falls back to the best move when there are no lines', async () => {
    const { engine } = fakeEngine({ bestMove: 'g1f3' })
    expect((await chooseBotMove({ engine }, request)).move).toBe('g1f3')
  })

  it('stops the search when cancelled', async () => {
    const { engine } = fakeEngine('hold')
    const controller = cancellable()
    const pending = chooseBotMove({ engine }, { ...request, signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(BotMoveCancelledError)
  })

  it('treats a search taken over by another one as cancelled', async () => {
    const { engine } = fakeEngine({ end: 'superseded' })
    await expect(chooseBotMove({ engine }, request)).rejects.toBeInstanceOf(BotMoveCancelledError)
  })

  it('reports engine failures and finished games', async () => {
    const failing = fakeEngine({ end: 'error', error: 'crashed' })
    await expect(chooseBotMove({ engine: failing.engine }, request)).rejects.toBeInstanceOf(
      EngineFailedError,
    )
    const { engine, requests } = fakeEngine({})
    await expect(chooseBotMove({ engine }, { ...request, fen: MATED })).rejects.toThrow(/over/)
    expect(requests).toHaveLength(0)
  })
})
