import type { EngineProvider } from '@chessy/analysis'
import { createApiClient, type ApiClient } from '@/adapters/api/client'
import { createBrowserEngine } from '@/adapters/engine/stockfish'

/** Everything the UI talks to the outside world through. Ports get added here per phase. */
export interface Services {
  api: ApiClient
  engine: EngineProvider
}

/** Composition root: the only place that decides which adapter fills which port. */
export function createServices(): Services {
  return {
    api: createApiClient(window.location.origin),
    engine: createBrowserEngine(),
  }
}
