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
  openGame,
  type GameRepository,
  type GameSource,
  type ImportReport,
  type LibraryGame,
  type SettingsStore,
  type SourceId,
} from '@chessy/library'
import {
  chooseBotMove,
  recordBotGame,
  type BotChoice,
  type BotMoveRequest,
  type FinishedBotGame,
} from '@chessy/play'
import { ApiGameSource } from '@/adapters/api/apiGameSource'
import { createApiClient, type ApiClient } from '@/adapters/api/client'
import { RemoteEvaluator } from '@/adapters/engine/remoteEvaluator'
import { createBrowserEngine } from '@/adapters/engine/stockfish'
import { RemoteHumanMoves } from '@/adapters/maia/remoteHumanMoves'
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
    /** Brings the game behind a lichess / chess.com page URL into the library. */
    openGame: (url: string) => Promise<LibraryGame>
  }
  play: {
    chooseBotMove: (request: BotMoveRequest) => Promise<BotChoice>
    /** Saves a finished bot game to the library. */
    saveBotGame: (finished: FinishedBotGame) => Promise<LibraryGame>
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

  // The bot's own engine, so a bot game never competes with analysis or a review.
  const botEngine = createBrowserEngine()
  const newId = () => crypto.randomUUID()
  const now = () => new Date()

  return {
    api,
    engine: createBrowserEngine(),
    play: {
      chooseBotMove: (request) => chooseBotMove({ engine: botEngine }, request),
      saveBotGame: (finished) => recordBotGame({ repository: games, newId, now }, finished),
    },
    review: {
      serverEngine: () => evaluators.server.describe().catch(() => undefined),
      run: async (input, { engine, ...options }) => {
        // The server's Maia, when it has one, judges which sacrifices were hard to find.
        const [book, humanMoves] = await Promise.all([loadBook(), RemoteHumanMoves.describe(api)])
        return reviewGame(
          { evaluator: evaluators[engine], cache: evals, book, ...(humanMoves && { humanMoves }) },
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
            newId,
            now,
          },
          { username },
        ),
      openGame: async (url) =>
        openGame(
          { sources, repository: games, newId, now },
          { url, usernames: (await settings.load()).usernames },
        ),
    },
  }
}
