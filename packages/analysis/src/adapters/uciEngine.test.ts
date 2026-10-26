import { InvalidPositionError } from '@chessy/chess'
import { describe, expect, it } from 'vitest'
import type { AnalysisSnapshot } from '../domain/analysis'
import type { UciTransport } from '../ports/uciTransport'
import { UciEngine } from './uciEngine'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const AFTER_D4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1'

/** Scriptable engine stand-in: records commands, emits whatever lines a test pushes. */
class FakeTransport implements UciTransport {
  sent: string[] = []
  terminated = false
  private lineListeners = new Set<(line: string) => void>()
  private errorListeners = new Set<(error: Error) => void>()

  private readonly respondToHandshake: boolean

  constructor(respondToHandshake = true) {
    this.respondToHandshake = respondToHandshake
  }

  send(command: string): void {
    this.sent.push(command)
    if (!this.respondToHandshake) return
    if (command === 'uci') this.emit('id name FakeFish 1', 'uciok')
    if (command === 'isready') this.emit('readyok')
  }
  emit(...lines: string[]): void {
    for (const line of lines) for (const listener of this.lineListeners) listener(line)
  }
  crash(message: string): void {
    for (const listener of this.errorListeners) listener(new Error(message))
  }
  onLine(listener: (line: string) => void) {
    this.lineListeners.add(listener)
    return () => this.lineListeners.delete(listener)
  }
  onError(listener: (error: Error) => void) {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }
  terminate(): void {
    this.terminated = true
  }
  /** Commands sent after the handshake. */
  get searchCommands(): string[] {
    return this.sent.filter(
      (c) => !['uci', 'isready'].includes(c) && !c.startsWith('setoption name Hash'),
    )
  }
}

function setup(transport = new FakeTransport()) {
  const engine = new UciEngine(() => transport, { initTimeoutMs: 50 })
  return { engine, transport }
}

const settle = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0))

describe('UciEngine', () => {
  it('loads lazily, then starts the search', async () => {
    const { engine, transport } = setup()
    expect(transport.sent).toEqual([])
    engine.analyze({ fen: START, multiPv: 3, depth: 10 })
    await settle()
    expect(transport.sent).toEqual([
      'uci',
      'setoption name Hash value 16',
      'isready',
      'setoption name MultiPV value 3',
      `position fen ${START}`,
      'go depth 10',
    ])
    expect(await engine.init()).toEqual({ name: 'FakeFish 1' })
  })

  it('reports lines best-first, from White’s point of view', async () => {
    const { engine, transport } = setup()
    const updates: AnalysisSnapshot[] = []
    const handle = engine.analyze({ fen: AFTER_E4, multiPv: 2 }, (s) => updates.push(s))
    await settle()

    transport.emit(
      'info string NNUE evaluation enabled',
      'info depth 5 currmove e7e5 currmovenumber 1',
      'info depth 5 multipv 2 score cp 40 nodes 900 pv c7c5 g1f3',
      'info depth 5 multipv 1 score cp 25 nodes 1000 nps 50000 time 20 pv e7e5 g1f3',
      'info depth 6 multipv 1 score cp 10 lowerbound pv e7e5',
      'info depth 6 multipv 3 score cp 90 pv a7a6',
    )
    const last = updates.at(-1)!
    expect(last.depth).toBe(5)
    expect(last.lines.map((l) => [l.rank, l.score, l.pv[0]])).toEqual([
      [1, { type: 'cp', value: -25 }, 'e7e5'],
      [2, { type: 'cp', value: -40 }, 'c7c5'],
    ])
    expect(last).toMatchObject({ nodes: 1000, nps: 50000, timeMs: 20 })

    transport.emit('bestmove e7e5 ponder g1f3')
    const result = await handle.result
    expect(result).toMatchObject({ end: 'limit', bestMove: 'e7e5', depth: 5 })
    expect(updates.at(-1)).toBe(result)
  })

  it('converts mate scores', async () => {
    const { engine, transport } = setup()
    const handle = engine.analyze({ fen: AFTER_E4 })
    await settle()
    transport.emit('info depth 9 score mate -2 pv d8h4', 'bestmove d8h4')
    expect((await handle.result).lines[0]?.score).toEqual({
      type: 'mate',
      winner: 'white',
      moves: 2,
    })
  })

  it('stops a running search when a new one starts, and drops its late output', async () => {
    const { engine, transport } = setup()
    const firstUpdates: AnalysisSnapshot[] = []
    const first = engine.analyze({ fen: START }, (s) => firstUpdates.push(s))
    await settle()
    transport.emit('info depth 10 score cp 30 pv e2e4')

    const second = engine.analyze({ fen: AFTER_E4, depth: 8 })
    expect(transport.searchCommands.at(-1)).toBe('stop')

    transport.emit('info depth 11 score cp 31 pv d2d4')
    expect(firstUpdates).toHaveLength(1)

    transport.emit('bestmove e2e4')
    expect(await first.result).toMatchObject({ end: 'superseded', depth: 10 })
    await settle()
    expect(transport.searchCommands.slice(-2)).toEqual([`position fen ${AFTER_E4}`, 'go depth 8'])

    transport.emit('info depth 8 score cp 20 pv e7e5', 'bestmove e7e5')
    expect(await second.result).toMatchObject({ fen: AFTER_E4, end: 'limit', bestMove: 'e7e5' })
  })

  it('keeps only the newest queued search', async () => {
    const { engine, transport } = setup()
    engine.analyze({ fen: START })
    await settle()
    const middle = engine.analyze({ fen: AFTER_E4 })
    const newest = engine.analyze({ fen: AFTER_D4, depth: 3 })

    expect(await middle.result).toMatchObject({ end: 'superseded', lines: [] })
    expect(transport.searchCommands.filter((c) => c === 'stop')).toHaveLength(1)

    transport.emit('bestmove e2e4')
    await settle()
    expect(transport.searchCommands.filter((c) => c.startsWith('position'))).toEqual([
      `position fen ${START}`,
      `position fen ${AFTER_D4}`,
    ])
    transport.emit('bestmove d7d5')
    expect(await newest.result).toMatchObject({ end: 'limit' })
  })

  it('stop() ends with the last lines; stopping a queued search sends nothing', async () => {
    const { engine, transport } = setup()
    const running = engine.analyze({ fen: START })
    await settle()
    transport.emit('info depth 14 score cp 22 pv e2e4 e7e5')
    running.stop()
    expect(transport.searchCommands.at(-1)).toBe('stop')
    transport.emit('bestmove e2e4')
    expect(await running.result).toMatchObject({ end: 'stopped', depth: 14, bestMove: 'e2e4' })

    const blocker = engine.analyze({ fen: START })
    await settle()
    const queued = engine.analyze({ fen: AFTER_E4 })
    const stopsBefore = transport.searchCommands.filter((c) => c === 'stop').length
    queued.stop()
    expect(await queued.result).toMatchObject({ end: 'stopped' })
    expect(transport.searchCommands.filter((c) => c === 'stop')).toHaveLength(stopsBefore)
    blocker.stop()
  })

  it('ends searches with an error when the engine fails to load', async () => {
    const { engine, transport } = setup()
    const handle = engine.analyze({ fen: START })
    transport.crash('wasm failed to load')
    expect(await handle.result).toMatchObject({ end: 'error', error: 'wasm failed to load' })
    expect(await engine.analyze({ fen: START }).result).toMatchObject({ end: 'error' })
  })

  it('times out when the engine never answers', async () => {
    const { engine } = setup(new FakeTransport(false))
    const result = await engine.analyze({ fen: START }).result
    expect(result.end).toBe('error')
    expect(result.error).toMatch(/did not respond/)
  })

  it('dispose() stops everything and terminates the transport', async () => {
    const { engine, transport } = setup()
    const running = engine.analyze({ fen: START })
    await settle()
    engine.dispose()
    expect(transport.terminated).toBe(true)
    expect(await running.result).toMatchObject({ end: 'stopped' })
    expect(await engine.analyze({ fen: START }).result).toMatchObject({ end: 'stopped' })
  })

  it('rejects invalid positions before they reach the engine', () => {
    const { engine, transport } = setup()
    expect(() => engine.analyze({ fen: 'not a fen' })).toThrow(InvalidPositionError)
    expect(transport.sent).toEqual([])
  })
})
