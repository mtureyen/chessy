import { createGame, type Color } from '@chessy/chess'
import type { AnalysisEnd, AnalysisRequest, AnalysisSnapshot, EngineLine } from '../domain/analysis'
import { toWhitePov } from '../domain/score'
import { goCommand, parseBestMove, parseInfo } from '../domain/uci'
import type { AnalysisHandle, EngineInfo, EngineProvider } from '../ports/engine'
import type { UciTransport } from '../ports/uciTransport'

export interface UciEngineOptions {
  hashMb?: number
  /** How long loading (uci → uciok → readyok) may take before the engine counts as failed. */
  initTimeoutMs?: number
}

interface Search {
  request: AnalysisRequest
  sideToMove: Color
  lines: Map<number, EngineLine>
  snapshot: AnalysisSnapshot
  onUpdate: ((snapshot: AnalysisSnapshot) => void) | undefined
  /** Set once we asked the engine to stop; output after that belongs to no one. */
  stopReason?: 'stopped' | 'superseded'
  resolve: (snapshot: AnalysisSnapshot) => void
}

interface Waiter {
  match: (line: string) => boolean
  resolve: () => void
  reject: (error: Error) => void
}

/**
 * EngineProvider for any UCI engine behind a UciTransport.
 *
 * The engine runs one search at a time. A new `analyze` call queues its search, stops the
 * running one, and starts once the engine confirms with `bestmove`. Only the newest queued
 * search survives; output arriving after a stop request is discarded.
 */
export class UciEngine implements EngineProvider {
  private readonly createTransport: () => UciTransport
  private readonly options: Required<UciEngineOptions>
  private transport: UciTransport | undefined
  private initPromise: Promise<EngineInfo> | undefined
  private engineName = 'UCI engine'
  private running: Search | undefined
  private queued: Search | undefined
  private waiters: Waiter[] = []
  private failure: Error | undefined
  private disposed = false

  constructor(createTransport: () => UciTransport, options: UciEngineOptions = {}) {
    this.createTransport = createTransport
    this.options = { hashMb: 16, initTimeoutMs: 30_000, ...options }
  }

  init(): Promise<EngineInfo> {
    this.initPromise ??= this.handshake()
    return this.initPromise
  }

  analyze(
    request: AnalysisRequest,
    onUpdate?: (snapshot: AnalysisSnapshot) => void,
  ): AnalysisHandle {
    const sideToMove = createGame(request.fen).turn()
    let resolve!: (snapshot: AnalysisSnapshot) => void
    const result = new Promise<AnalysisSnapshot>((r) => (resolve = r))
    const search: Search = {
      request,
      sideToMove,
      lines: new Map(),
      snapshot: { fen: request.fen, depth: 0, lines: [] },
      onUpdate,
      resolve,
    }

    if (this.disposed) {
      this.finish(search, 'stopped')
    } else {
      if (this.queued) this.finish(this.queued, 'superseded')
      this.queued = search
      if (this.running) this.requestStop(this.running, 'superseded')
      else void this.startNext()
    }

    return {
      result,
      stop: () => {
        if (search === this.queued) {
          this.queued = undefined
          this.finish(search, 'stopped')
        } else if (search === this.running) {
          this.requestStop(search, 'stopped')
        }
      },
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const search of [this.queued, this.running]) if (search) this.finish(search, 'stopped')
    this.queued = this.running = undefined
    this.rejectWaiters(new Error('Engine disposed'))
    if (this.transport) {
      this.transport.send('quit')
      this.transport.terminate()
    }
  }

  private async handshake(): Promise<EngineInfo> {
    const transport = this.createTransport()
    this.transport = transport
    transport.onLine((line) => this.onLine(line))
    transport.onError((error) => this.fail(error))

    // Listen before sending: an engine may answer synchronously.
    const uciok = this.waitFor((line) => line === 'uciok')
    transport.send('uci')
    await uciok
    transport.send(`setoption name Hash value ${this.options.hashMb}`)
    const readyok = this.waitFor((line) => line === 'readyok')
    transport.send('isready')
    await readyok
    return { name: this.engineName }
  }

  private async startNext(): Promise<void> {
    try {
      await this.init()
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)))
      return
    }
    if (this.running || !this.queued || !this.transport) return

    const search = this.queued
    this.queued = undefined
    this.running = search
    this.transport.send(`setoption name MultiPV value ${search.request.multiPv ?? 1}`)
    this.transport.send(`position fen ${search.request.fen}`)
    this.transport.send(goCommand(search.request))
  }

  private onLine(line: string): void {
    if (line.startsWith('id name ')) this.engineName = line.slice('id name '.length)
    for (const waiter of this.waiters.filter((w) => w.match(line))) {
      this.waiters.splice(this.waiters.indexOf(waiter), 1)
      waiter.resolve()
    }

    const search = this.running
    if (!search) return

    const best = parseBestMove(line)
    if (best) {
      this.running = undefined
      this.finish(search, search.stopReason ?? 'limit', best.move)
      void this.startNext()
      return
    }
    if (search.stopReason) return

    const info = parseInfo(line)
    if (!info?.score || info.score.bound || info.depth === undefined || info.pv.length === 0) return
    if (info.multipv > (search.request.multiPv ?? 1)) return

    search.lines.set(info.multipv, {
      rank: info.multipv,
      depth: info.depth,
      score: toWhitePov(info.score, search.sideToMove),
      pv: info.pv,
    })
    const lines = [...search.lines.values()].sort((a, b) => a.rank - b.rank)
    search.snapshot = {
      fen: search.request.fen,
      depth: lines[0]?.depth ?? 0,
      lines,
      nodes: info.nodes,
      nps: info.nps,
      timeMs: info.timeMs,
    }
    search.onUpdate?.(search.snapshot)
  }

  private requestStop(search: Search, reason: 'stopped' | 'superseded'): void {
    if (search.stopReason) {
      // A user stop turning into a supersede keeps the stronger meaning.
      if (reason === 'superseded') search.stopReason = reason
      return
    }
    search.stopReason = reason
    this.transport?.send('stop')
  }

  private finish(search: Search, end: AnalysisEnd, bestMove?: string, error?: string): void {
    const snapshot: AnalysisSnapshot = { ...search.snapshot, end }
    if (bestMove) snapshot.bestMove = bestMove
    if (error) snapshot.error = error
    search.snapshot = snapshot
    if (end !== 'superseded') search.onUpdate?.(snapshot)
    search.resolve(snapshot)
  }

  /** Marks the engine as broken. Every pending and future search ends with 'error'. */
  private fail(error: Error): void {
    this.failure ??= error
    this.rejectWaiters(this.failure)
    for (const search of [this.queued, this.running]) {
      if (search) this.finish(search, 'error', undefined, this.failure.message)
    }
    this.queued = this.running = undefined
  }

  private waitFor(match: (line: string) => boolean): Promise<void> {
    if (this.failure) return Promise.reject(this.failure)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Engine did not respond within ${this.options.initTimeoutMs} ms`))
      }, this.options.initTimeoutMs)
      this.waiters.push({
        match,
        resolve: () => {
          clearTimeout(timer)
          resolve()
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
    })
  }

  private rejectWaiters(error: Error): void {
    const waiters = this.waiters
    this.waiters = []
    for (const waiter of waiters) waiter.reject(error)
  }
}
