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
  mirrorLibrary,
  MirroredGameRepository,
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
import { RemoteLibrary } from '@/adapters/api/remoteLibrary'
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
    /** The server's human-move model (e.g. "Maia-3") that human-like levels play with, if any. */
    humanModel: () => Promise<string | undefined>
    chooseBotMove: (request: BotMoveRequest) => Promise<BotChoice>
    /** Saves a finished bot game to the library. */
    saveBotGame: (finished: FinishedBotGame) => Promise<LibraryGame>
  }
  history: {
    /**
     * Sends the server's game history what it lacks (games saved while it was down); resolves
     * to how many games were sent, or undefined when the server keeps no history.
     */
    sync: () => Promise<number | undefined>
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
  const local = createLazyStorage(() =>
    import('@/adapters/storage/dexieStorage').then((m) => m.createDexieStorage()),
  )
  const { settings, evals } = local
  // Everything the library saves also goes to the server's game history (when it keeps one).
  const remoteLibrary = new RemoteLibrary(api)
  const games = new MirroredGameRepository(local.games, remoteLibrary)
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
  const botHuman = humanPolicyLoader(api)
  const newId = () => crypto.randomUUID()
  const now = () => new Date()

  return {
    api,
    engine: createBrowserEngine(),
    play: {
      humanModel: async () => (await botHuman())?.name,
      chooseBotMove: async (request) => {
        const human = request.level.human ? await botHuman() : undefined
        return chooseBotMove({ engine: botEngine, ...(human && { human }) }, request)
      },
      saveBotGame: (finished) => recordBotGame({ repository: games, newId, now }, finished),
    },
    review: {
      serverEngine: () =>
        withTimeout(evaluators.server.describe(), SERVER_CHECK_MS).catch(() => undefined),
      run: async (input, { engine, ...options }) => {
        // The server's Maia, when it has one, judges which sacrifices were hard to find.
        const [book, humanMoves] = await Promise.all([loadBook(), RemoteHumanMoves.describe(api)])
        const review = await reviewGame(
          { evaluator: evaluators[engine], cache: evals, book, ...(humanMoves && { humanMoves }) },
          input,
          options,
        )
        // Kept in the server's history too; without one the review just isn't kept there.
        remoteLibrary
          .saveReview({ startFen: input.startFen, moves: input.moves }, review)
          .catch(() => undefined)
        return review
      },
    },
    history: {
      sync: async () => {
        const status = await withTimeout(remoteLibrary.status(), SERVER_CHECK_MS).catch(
          () => undefined,
        )
        if (!status?.available) return undefined
        return (await mirrorLibrary({ games: local.games, mirror: remoteLibrary })).uploaded
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

/** How long to wait for the API to say whether it has an engine before reviewing in the browser. */
const SERVER_CHECK_MS = 3000
/** How long a server without a human-move model is believed before asking again. */
const HUMAN_RECHECK_MS = 30_000

/** The server's human-move model, asked once (again later if it had none or was unreachable). */
function humanPolicyLoader(api: ApiClient): () => Promise<RemoteHumanMoves | undefined> {
  let known: Promise<RemoteHumanMoves | undefined> | undefined
  let askedAt = 0
  return () => {
    if (!known || Date.now() - askedAt > HUMAN_RECHECK_MS) {
      askedAt = Date.now()
      const asking = withTimeout(RemoteHumanMoves.describe(api), SERVER_CHECK_MS).catch(
        () => undefined,
      )
      // Keep a found model for good; a miss only until the next check.
      known = asking.then((model) => {
        if (model) askedAt = Infinity
        return model
      })
    }
    return known
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No answer within ${ms} ms`)), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}
