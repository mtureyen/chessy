import { createGame, materialBalance, type Color, type GameStatus } from '@chessy/chess'
import type { EngineLine } from '../domain/analysis'
import { formatSanLine, toSanLine } from '../domain/line'
import type { Score } from '../domain/score'
import { gameAccuracy, moveAccuracy } from '../domain/review/accuracy'
import type { OpeningBook } from '../domain/review/book'
import { classifyMove, expectedPointsLost, type MoveFacts } from '../domain/review/classify'
import { evalCacheKey } from '../domain/review/keys'
import type { GameReview, PositionEval, ReviewedMove } from '../domain/review/types'
import { winPercent } from '../domain/review/winPercent'
import type { EngineProvider } from '../ports/engine'
import type { EvalCache } from '../ports/evalCache'

export interface ReviewDeps {
  engine: EngineProvider
  /** Engine name incl. version; part of the cache key. */
  engineName: string
  cache?: EvalCache
  book?: OpeningBook
}

/** The part of AbortSignal we use; browsers, Bun and Node signals all fit. */
export interface CancelSignal {
  readonly aborted: boolean
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void
  removeEventListener(type: 'abort', listener: () => void): void
}

export interface ReviewOptions {
  /** Node budget per position (same result on every device). */
  nodes: number
  signal?: CancelSignal
  onProgress?: (done: number, total: number) => void
}

export interface ReviewInput {
  startFen: string
  /** The game's moves in UCI. */
  moves: readonly string[]
}

export class ReviewCancelledError extends Error {
  constructor() {
    super('Review cancelled')
    this.name = 'ReviewCancelledError'
  }
}

export class ReviewEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReviewEngineError'
  }
}

/** Two lines: the second one tells whether the best move was the only good one ("great"). */
const REVIEW_MULTI_PV = 2

interface Position {
  fen: string
  turn: Color
  legalMoves: number
  inCheck: boolean
  status: GameStatus
}

/**
 * Reviews a game: evaluates every position (cache first, then the engine), then classifies each
 * move chess.com-style and computes accuracy the lichess way.
 */
export async function reviewGame(
  deps: ReviewDeps,
  input: ReviewInput,
  options: ReviewOptions,
): Promise<GameReview> {
  const { positions, played } = replay(input)
  const evals: PositionEval[] = []
  for (const [i, position] of positions.entries()) {
    if (options.signal?.aborted) throw new ReviewCancelledError()
    evals.push(await evaluate(deps, position, options))
    options.onProgress?.(i + 1, positions.length)
  }

  const scores = positions.map((p, i) => bestScore(p, evals[i]!))
  const moves: ReviewedMove[] = []
  let previousLoss: number | undefined
  for (const [i, move] of played.entries()) {
    const before = positions[i]!
    const after = positions[i + 1]!
    const lines = evals[i]!.lines
    const facts: MoveFacts = {
      isBestMove: lines[0]?.pv[0] === move.uci,
      winBefore: winPercent(scores[i]!, move.color),
      winAfter: winPercent(scores[i + 1]!, move.color),
      legalMoves: before.legalMoves,
      inBook:
        !!deps.book?.isBook(after.fen) && (i === 0 || moves[i - 1]?.classification === 'book'),
      sacrifice: sacrifice(before.fen, move.uci, move.color, evals[i + 1]!.lines[0]?.pv ?? []),
      isRecapture:
        i > 0 && move.san.includes('x') && played[i - 1]!.uci.slice(2, 4) === move.uci.slice(2, 4),
      inCheck: before.inCheck,
    }
    if (lines[1]) facts.secondBestWin = winPercent(lines[1].score, move.color)
    if (previousLoss !== undefined) facts.opponentLoss = previousLoss

    const best = lines[0]?.pv[0]
    const bestLine = best ? toSanLine(before.fen, lines[0]!.pv, 8) : []
    moves.push({
      ply: i + 1,
      moveNumber: move.moveNumber,
      color: move.color,
      san: move.san,
      uci: move.uci,
      winBefore: facts.winBefore,
      winAfter: facts.winAfter,
      accuracy: moveAccuracy(facts.winBefore, facts.winAfter),
      classification: classifyMove(facts),
      ...(best && bestLine[0]
        ? { best: { uci: best, san: bestLine[0].san, line: lines[0]!.pv.slice(0, 8) } }
        : {}),
    })
    previousLoss = expectedPointsLost(facts)
  }

  const counts: GameReview['counts'] = { white: {}, black: {} }
  for (const m of moves)
    counts[m.color][m.classification] = (counts[m.color][m.classification] ?? 0) + 1

  return {
    startFen: input.startFen,
    positions: positions.map((p, i) => ({
      fen: p.fen,
      score: scores[i]!,
      whiteWin: winPercent(scores[i]!, 'white'),
    })),
    moves,
    accuracy: gameAccuracy(
      positions.map((_, i) => winPercent(scores[i]!, 'white')),
      positions[0]!.turn,
    ),
    counts,
    settings: { engine: deps.engineName, nodes: options.nodes },
  }
}

function replay(input: ReviewInput) {
  const game = createGame(input.startFen)
  const snapshot = (): Position => ({
    fen: game.fen(),
    turn: game.turn(),
    legalMoves: game.legalMoves().length,
    inCheck: game.isCheck(),
    status: game.status(),
  })
  const positions = [snapshot()]
  const played: { uci: string; san: string; color: Color; moveNumber: number }[] = []
  for (const uci of input.moves) {
    const node = game.play(uci)
    if (!node?.move) throw new Error(`Illegal move in review input: ${uci}`)
    played.push({
      uci: node.move.uci,
      san: node.move.san,
      color: node.move.color,
      moveNumber: node.move.moveNumber,
    })
    positions.push(snapshot())
  }
  return { positions, played }
}

async function evaluate(
  deps: ReviewDeps,
  position: Position,
  options: ReviewOptions,
): Promise<PositionEval> {
  if (position.legalMoves === 0) return { lines: [], depth: 0 }

  const key = evalCacheKey({
    engine: deps.engineName,
    nodes: options.nodes,
    multiPv: REVIEW_MULTI_PV,
    fen: position.fen,
  })
  const cached = await deps.cache?.get(key)
  if (cached) return cached

  if (options.signal?.aborted) throw new ReviewCancelledError()
  const handle = deps.engine.analyze({
    fen: position.fen,
    nodes: options.nodes,
    multiPv: REVIEW_MULTI_PV,
  })
  const onAbort = () => handle.stop()
  options.signal?.addEventListener('abort', onAbort, { once: true })
  // The signal may have fired while we were awaiting the cache; listeners added later never run.
  if (options.signal?.aborted) handle.stop()
  const result = await handle.result
  options.signal?.removeEventListener('abort', onAbort)

  if (options.signal?.aborted) throw new ReviewCancelledError()
  if (result.end === 'error') throw new ReviewEngineError(result.error ?? 'Engine failed')
  if (result.end === 'superseded')
    throw new ReviewEngineError('The engine was taken over by another analysis')

  const value: PositionEval = { lines: result.lines, depth: result.depth }
  await deps.cache?.put(key, value)
  return value
}

/** The position's value with best play; game-over positions are scored by their result. */
function bestScore(position: Position, evaluation: PositionEval): Score {
  if (position.status.kind === 'checkmate')
    return { type: 'mate', winner: position.status.winner, moves: 0 }
  if (position.legalMoves === 0) return { type: 'cp', value: 0 }
  return evaluation.lines[0]?.score ?? { type: 'cp', value: 0 }
}

/**
 * Material the mover is down after offering a piece: the opponent's best reply takes on the
 * destination square and the mover does not simply take back. 0 if nothing was given up.
 */
function sacrifice(
  fenBefore: string,
  uci: string,
  mover: Color,
  replyLine: readonly string[],
): number {
  const [reply, followUp] = replyLine
  if (!reply || reply.slice(2, 4) !== uci.slice(2, 4)) return 0
  const game = createGame(fenBefore)
  for (const step of [uci, reply, followUp]) {
    if (step && !game.play(step)) break
  }
  const sign = mover === 'white' ? 1 : -1
  return Math.max(0, sign * (materialBalance(fenBefore) - materialBalance(game.fen())))
}

/** Human-readable best line, e.g. for "Best was 14. Nf3 Nc6 15. Bb5". */
export function describeBest(fenBefore: string, line: EngineLine['pv']): string {
  return formatSanLine(toSanLine(fenBefore, line, 6))
}
