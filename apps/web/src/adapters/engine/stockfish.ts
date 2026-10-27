import { UciEngine, type EngineProvider, type UciTransport } from '@chessy/analysis'

/** Served from public/engine/, downloaded by scripts/fetch-engine.ts. */
export const STOCKFISH_URL = '/engine/stockfish-19-lite-single.js'

/** UciTransport over a classic Web Worker running Stockfish.js; UCI lines travel via postMessage. */
export function createWorkerTransport(url: string = STOCKFISH_URL): UciTransport {
  const worker = new Worker(url)
  const lineListeners = new Set<(line: string) => void>()
  const errorListeners = new Set<(error: Error) => void>()

  worker.onmessage = (event: MessageEvent) => {
    for (const line of String(event.data).split('\n')) {
      if (line) for (const listener of lineListeners) listener(line)
    }
  }
  worker.onerror = (event: ErrorEvent) => {
    event.preventDefault()
    const error = new Error(event.message || `Engine worker failed to load (${url})`)
    for (const listener of errorListeners) listener(error)
  }

  return {
    send: (command) => worker.postMessage(command),
    onLine(listener) {
      lineListeners.add(listener)
      return () => lineListeners.delete(listener)
    },
    onError(listener) {
      errorListeners.add(listener)
      return () => errorListeners.delete(listener)
    },
    terminate: () => worker.terminate(),
  }
}

/** Stockfish in the browser. The worker (and its ~1.8 MB download) starts on first use. */
export function createBrowserEngine(url: string = STOCKFISH_URL): EngineProvider {
  return new UciEngine(() => createWorkerTransport(url))
}
