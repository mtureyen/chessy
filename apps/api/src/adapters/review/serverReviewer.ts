import {
  EngineFailedError,
  EvaluationCancelledError,
  reviewGame,
  type CancelSignal,
  type EvaluateOptions,
  type EvaluationRequest,
  type GameReview,
  type HumanMoveModel,
  type PositionEval,
  type PositionEvaluator,
  type ReviewInput,
} from '@pawnia/analysis'
import { lineText } from '@pawnia/history'
import type { EngineService } from '../engine/service'
import type { HumanMoveService } from '../humanMoves/service'
import { createBookLoader } from './openingBook'

/** The app's "Standard" review: the same node budget gives the same review on every device. */
export const SERVER_REVIEW_NODES = 500_000

/**
 * Reviews games here, the way the app does: the native engine, the opening book (the web app's
 * file) and, when the server has it, Maia for how hard moves were to find. A line already being
 * reviewed is not reviewed twice at the same time.
 */
export function createServerReviewer({
  engine,
  humanMoves,
  bookPath,
  nodes = SERVER_REVIEW_NODES,
  batchSize,
}: {
  engine: EngineService
  humanMoves: HumanMoveService
  bookPath: string
  nodes?: number
  /**
   * Positions per engine request. The engine serves one request at a time, so a review in the
   * background asks in small batches and others get their turn in between. Default: all at once.
   */
  batchSize?: number
}): (input: ReviewInput, options?: { signal?: CancelSignal }) => Promise<GameReview> {
  const evaluator: PositionEvaluator = {
    describe: async () => {
      const status = await engine.status()
      if (!status.available)
        throw new EngineFailedError(`no engine on this server (${status.reason})`)
      return { name: status.name, parallelism: status.parallelism }
    },
    evaluate: (request, options) =>
      batchSize
        ? evaluateInBatches(engine, request, options, batchSize)
        : engine.evaluate(request, options),
  }
  // Without the file the review still works; it just can't tell book moves.
  const loadBook = createBookLoader(bookPath)
  const running = new Map<string, Promise<GameReview>>()

  return (input, { signal } = {}) => {
    const key = lineText(input)
    const pending = running.get(key)
    if (pending) return pending
    const review = (async () => {
      const [openings, model] = await Promise.all([loadBook(), humanMoveModel(humanMoves)])
      return reviewGame(
        {
          evaluator,
          ...(openings && { book: openings }),
          ...(model && { humanMoves: model }),
        },
        input,
        { nodes, ...(signal && { signal }) },
      )
    })().finally(() => running.delete(key))
    running.set(key, review)
    return review
  }
}

async function evaluateInBatches(
  engine: EngineService,
  request: EvaluationRequest,
  options: EvaluateOptions = {},
  size: number,
): Promise<PositionEval[]> {
  const results: PositionEval[] = []
  for (let start = 0; start < request.fens.length; start += size) {
    if (options.signal?.aborted) throw new EvaluationCancelledError()
    const offset = start
    const { onEvaluated } = options
    const batch = await engine.evaluate(
      { ...request, fens: request.fens.slice(start, start + size) },
      {
        ...options,
        ...(onEvaluated && { onEvaluated: (i, value) => onEvaluated(offset + i, value) }),
      },
    )
    results.push(...batch)
  }
  return results
}

async function humanMoveModel(service: HumanMoveService): Promise<HumanMoveModel | undefined> {
  const status = await service.status()
  if (!status.available) return undefined
  return { name: status.name, moveProbabilities: (queries) => service.moveProbabilities(queries) }
}
