import type { EngineProvider } from '@chessy/analysis'
import {
  importRecentGames,
  type GameRepository,
  type GameSource,
  type ImportReport,
  type SettingsStore,
  type SourceId,
} from '@chessy/library'
import { ApiGameSource } from '@/adapters/api/apiGameSource'
import { createApiClient, type ApiClient } from '@/adapters/api/client'
import { createBrowserEngine } from '@/adapters/engine/stockfish'
import { createLazyStorage } from '@/adapters/storage/lazyStorage'

/** Everything the UI talks to the outside world through. Ports get added here per phase. */
export interface Services {
  api: ApiClient
  engine: EngineProvider
  library: {
    games: GameRepository
    settings: SettingsStore
    sources: Record<SourceId, GameSource>
    importRecentGames: (source: SourceId, username: string) => Promise<ImportReport>
  }
}

/** Composition root: the only place that decides which adapter fills which port. */
export function createServices(): Services {
  const api = createApiClient(window.location.origin)
  const { games, settings } = createLazyStorage(() =>
    import('@/adapters/storage/dexieStorage').then((m) => m.createDexieStorage()),
  )
  const sources: Record<SourceId, GameSource> = {
    lichess: new ApiGameSource('lichess', api),
    chesscom: new ApiGameSource('chesscom', api),
  }
  return {
    api,
    engine: createBrowserEngine(),
    library: {
      games,
      settings,
      sources,
      importRecentGames: (source, username) =>
        importRecentGames(
          {
            source: sources[source],
            repository: games,
            newId: () => crypto.randomUUID(),
            now: () => new Date(),
          },
          { username },
        ),
    },
  }
}
