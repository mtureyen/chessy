import {
  EnginePoolEvaluator,
  reviewGame,
  type EngineProvider,
  type EvaluatorInfo,
  type GameReview,
  type PositionEvaluator,
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
import { RemoteEvaluator } from '@/adapters/engine/remoteEvaluator'
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
    /** The API's native engine, if the server has one. */
    serverEngine: () => Promise<EvaluatorInfo | undefined>
    run: (
      input: ReviewInput,
      options: ReviewOptions & { engine: ReviewEngine },
    ) => Promise<GameReview>
  }
}

/** Where a review's positions are evaluated: native on the server, or WASM in this browser. */
export type ReviewEngine = 'server' | 'browser'

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
  const loadBook = createBookLoader()
  const evaluators: Record<ReviewEngine, PositionEvaluator> = {
    server: new RemoteEvaluator(api, window.location.origin),
    // Its own engine, so a review never interrupts the live analysis on the same page.
    browser: new EnginePoolEvaluator([createBrowserEngine()]),
  }

  return {
    api,
    engine: createBrowserEngine(),
    review: {
      serverEngine: () => evaluators.server.describe().catch(() => undefined),
      run: async (input, { engine, ...options }) =>
        reviewGame(
          { evaluator: evaluators[engine], cache: evals, book: await loadBook() },
          input,
          options,
        ),
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
