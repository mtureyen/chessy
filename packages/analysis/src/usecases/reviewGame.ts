import {
  createGame,
  materialBalance,
  mostExposedPiece,
  type Color,
  type GameStatus,
} from '@chessy/chess'
import type { EngineLine } from '../domain/analysis'
import { formatSanLine, toSanLine } from '../domain/line'
import type { Score } from '../domain/score'
import { gameAccuracy, moveAccuracy } from '../domain/review/accuracy'
import type { OpeningBook } from '../domain/review/book'
import { classifyMove, expectedPointsLost, type MoveFacts } from '../domain/review/classify'
import { evalCacheKey } from '../domain/review/keys'
import type { GameReview, PositionEval, ReviewedMove } from '../domain/review/types'
import { winPercent } from '../domain/review/winPercent'
import type { EvalCache } from '../ports/evalCache'
import type { HumanMoveModel } from '../ports/humanMoveModel'
import {
  EvaluationCancelledError,
  type CancelSignal,
  type PositionEvaluator,
} from '../ports/evaluator'

export interface ReviewDeps {
  evaluator: PositionEvaluator
  cache?: EvalCache
  book?: OpeningBook
  /** Tells hard-to-find moves from obvious ones (brilliant needs the former). Optional. */
  humanMoves?: HumanMoveModel
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
  /** The players' ratings, for judging how hard a move was to find; 1500 when unknown. */
  ratings?: { white?: number; black?: number }
}

const DEFAULT_RATING = 1500

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
 * Reviews a game: evaluates every position (cache first, the rest in one batch by the
 * evaluator), then classifies each move chess.com-style and computes accuracy the lichess way.
 * Throws EvaluationCancelledError or EngineFailedError.
 */
export async function reviewGame(
  deps: ReviewDeps,
  input: ReviewInput,
  options: ReviewOptions,
): Promise<GameReview> {
  const { positions, played } = replay(input)
  const { name: engine } = await deps.evaluator.describe()
  const evals = await evaluateAll(deps, engine, positions, options)

  const scores = positions.map((p, i) => bestScore(p, evals[i]!))
  const human = await humanProbabilities(deps, input, positions, played)
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
      sacrifice: materialOffered(before.fen, after.fen, move.color),
      sacrificeTaken: sacrificeTaken(
        before.fen,
        move.uci,
        move.color,
        evals[i + 1]!.lines[0]?.pv ?? [],
      ),
      isPromotion: move.uci.length > 4,
      isRecapture:
        i > 0 && move.san.includes('x') && played[i - 1]!.uci.slice(2, 4) === move.uci.slice(2, 4),
      inCheck: before.inCheck,
      ...(input.ratings?.[move.color] !== undefined && { rating: input.ratings[move.color] }),
    }
    if (lines[1]) facts.secondBestWin = winPercent(lines[1].score, move.color)
    if (human) facts.humanProbability = human[i]!
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
      facts,
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
    settings: {
      engine,
      nodes: options.nodes,
      ...(human && deps.humanMoves && { humanMoves: deps.humanMoves.name }),
    },
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

/**
 * How likely a player of the mover's rating was to play each move; undefined without a model.
 * A failing model only costs the finer brilliant rule, never the review.
 */
async function humanProbabilities(
  deps: ReviewDeps,
  input: ReviewInput,
  positions: readonly Position[],
  played: readonly { uci: string; color: Color }[],
): Promise<number[] | undefined> {
  if (!deps.humanMoves || played.length === 0) return undefined
  const rating = (color: Color) => input.ratings?.[color] ?? DEFAULT_RATING
  try {
    return await deps.humanMoves.moveProbabilities(
      played.map((move, i) => ({
        fen: positions[i]!.fen,
        move: move.uci,
        eloSelf: rating(move.color),
        eloOppo: rating(move.color === 'white' ? 'black' : 'white'),
      })),
    )
  } catch {
    return undefined
  }
}

/** Cached evaluations first; the rest in one batch, so the evaluator can parallelise. */
async function evaluateAll(
  deps: ReviewDeps,
  engine: string,
  positions: readonly Position[],
  options: ReviewOptions,
): Promise<PositionEval[]> {
  const evals: (PositionEval | undefined)[] = new Array(positions.length)
  const keys = positions.map((p) =>
    evalCacheKey({ engine, nodes: options.nodes, multiPv: REVIEW_MULTI_PV, fen: p.fen }),
  )
  let done = 0
  const report = () => options.onProgress?.(++done, positions.length)

  const missing: number[] = []
  for (const [i, position] of positions.entries()) {
    if (options.signal?.aborted) throw new EvaluationCancelledError()
    const known =
      position.legalMoves === 0 ? { lines: [], depth: 0 } : await deps.cache?.get(keys[i]!)
    if (known) {
      evals[i] = known
      report()
    } else {
      missing.push(i)
    }
  }

  if (missing.length > 0) {
    const evaluated = await deps.evaluator.evaluate(
      {
        fens: missing.map((i) => positions[i]!.fen),
        nodes: options.nodes,
        multiPv: REVIEW_MULTI_PV,
      },
      {
        ...(options.signal ? { signal: options.signal } : {}),
        onEvaluated: (j, value) => {
          report()
          // A failing cache only costs speed next time; it must not break the review.
          deps.cache?.put(keys[missing[j]!]!, value).catch(() => undefined)
        },
      },
    )
    evaluated.forEach((value, j) => (evals[missing[j]!] = value))
  }
  return evals.map((value) => value ?? { lines: [], depth: 0 })
}

/** The position's value with best play; game-over positions are scored by their result. */
function bestScore(position: Position, evaluation: PositionEval): Score {
  if (position.status.kind === 'checkmate')
    return { type: 'mate', winner: position.status.winner, moves: 0 }
  if (position.legalMoves === 0) return { type: 'cp', value: 0 }
  return evaluation.lines[0]?.score ?? { type: 'cp', value: 0 }
}

/**
 * Material (pawns) the mover leaves for the taking: the most the opponent could now win by
 * capturing one of the mover's pieces (static exchange), less what the move itself captured.
 * Covers giving up the moved piece, leaving another piece en prise (ignoring a threat), and
 * captures that cost more than they take. 0 if nothing is offered.
 */
function materialOffered(fenBefore: string, fenAfter: string, mover: Color): number {
  const exposed = mostExposedPiece(fenAfter, mover)?.gain ?? 0
  const sign = mover === 'white' ? 1 : -1
  const captured = Math.max(0, sign * (materialBalance(fenAfter) - materialBalance(fenBefore)))
  return Math.max(0, exposed - captured)
}

/**
 * Material the mover is down after offering the moved piece: the opponent's best reply takes on
 * the destination square and the mover does not simply take back. 0 if nothing was given up.
 */
function sacrificeTaken(
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
