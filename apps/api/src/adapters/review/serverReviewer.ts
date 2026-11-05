import { readFile } from 'node:fs/promises'
import {
  EngineFailedError,
  createOpeningBook,
  reviewGame,
  type BookData,
  type GameReview,
  type HumanMoveModel,
  type OpeningBook,
  type PositionEvaluator,
  type ReviewInput,
} from '@chessy/analysis'
import { lineText } from '@chessy/history'
import type { EngineService } from '../engine/service'
import type { HumanMoveService } from '../humanMoves/service'

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
}: {
  engine: EngineService
  humanMoves: HumanMoveService
  bookPath: string
  nodes?: number
}): (input: ReviewInput) => Promise<GameReview> {
  const evaluator: PositionEvaluator = {
    describe: async () => {
      const status = await engine.status()
      if (!status.available)
        throw new EngineFailedError(`no engine on this server (${status.reason})`)
      return { name: status.name, parallelism: status.parallelism }
    },
    evaluate: (request, options) => engine.evaluate(request, options),
  }
  let book: Promise<OpeningBook | undefined> | undefined
  // Without the file the review still works; it just can't tell book moves.
  const loadBook = () =>
    (book ??= readFile(bookPath, 'utf8')
      .then((text) => createOpeningBook(JSON.parse(text) as BookData))
      .catch(() => undefined))
  const running = new Map<string, Promise<GameReview>>()

  return (input) => {
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
        { nodes },
      )
    })().finally(() => running.delete(key))
    running.set(key, review)
    return review
  }
}

async function humanMoveModel(service: HumanMoveService): Promise<HumanMoveModel | undefined> {
  const status = await service.status()
  if (!status.available) return undefined
  return { name: status.name, moveProbabilities: (queries) => service.moveProbabilities(queries) }
}
