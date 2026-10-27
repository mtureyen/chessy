import {
  reviewGame,
  type EngineProvider,
  type GameReview,
  type ReviewInput,
  type ReviewOptions,
} from '@chessy/analysis'
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
import { createBookLoader } from '@/adapters/openings/bookLoader'
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
  review: {
    run: (input: ReviewInput, options: ReviewOptions) => Promise<GameReview>
  }
}

/** Composition root: the only place that decides which adapter fills which port. */
export function createServices(): Services {
  const api = createApiClient(window.location.origin)
  const { games, settings, evals } = createLazyStorage(() =>
    import('@/adapters/storage/dexieStorage').then((m) => m.createDexieStorage()),
  )
  const sources: Record<SourceId, GameSource> = {
    lichess: new ApiGameSource('lichess', api),
    chesscom: new ApiGameSource('chesscom', api),
  }
  // Reviews get their own engine so they never interrupt the live analysis on the same page.
  const reviewEngine = createBrowserEngine()
  const loadBook = createBookLoader()

  return {
    api,
    engine: createBrowserEngine(),
    review: {
      run: async (input, options) => {
        const [info, book] = await Promise.all([reviewEngine.init(), loadBook()])
        return reviewGame(
          { engine: reviewEngine, engineName: info.name, cache: evals, book },
          input,
          options,
        )
      },
    },
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
