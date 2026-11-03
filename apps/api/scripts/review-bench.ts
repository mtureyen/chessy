/**
 * Measures the game review's brilliant detection against chess.com's own: runs the real
 * reviewGame over games where chess.com marked one move brilliant, and reports how many of those
 * we find and how many other moves we call brilliant.
 *
 *   bun run review:bench <dataset.json> [--split tune|check|all] [--nodes 500000]
 *                        [--parallel 8] [--out results.json] [--no-maia] [--dump facts.json]
 *
 * With the Maia model (`bun run maia:fetch`) the review also judges how hard each move was to
 * find for players of the game's ratings; --no-maia measures without it.
 *
 * The dataset is a JSON array of { pgn, ply } (ply of the brilliant move, 1 = White's first),
 * e.g. Chessigma's brilliant benchmark (chessigma.com/benchmarks/brilliant, "Download the
 * dataset"); it is not part of this repo. Even-numbered games are for tuning the rules, odd ones
 * for checking them, so rules aren't fitted to the very games they are judged on.
 *
 * Evaluations are cached in apps/api/.bench/, so only the first run waits for the engine and
 * later runs measure a rule change in seconds.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  EnginePoolEvaluator,
  UciEngine,
  createOpeningBook,
  reviewGame,
  type EvalCache,
  type HumanMoveModel,
  type MoveClass,
  type MoveFacts,
  type PositionEval,
} from '@chessy/analysis'
import { importPgn } from '@chessy/chess'
import { OnnxMaiaModel, moveProbabilities, type MoveProbabilityQuery } from '@chessy/maia'
import * as ort from 'onnxruntime-web'
import { createProcessTransport } from '../src/adapters/engine/processTransport'
import { defaultPoolSize, resolveStockfishPath } from '../src/adapters/engine/native'
import { MAIA_MODEL } from './fetch-maia'

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    split: { type: 'string', default: 'all' },
    nodes: { type: 'string', default: '500000' },
    parallel: { type: 'string', default: String(defaultPoolSize()) },
    out: { type: 'string' },
    'no-maia': { type: 'boolean', default: false },
    /** Every move's facts, for trying rule changes offline. */
    dump: { type: 'string' },
  },
})

const BENCH_DIR = fileURLToPath(new URL('../.bench/', import.meta.url))
const BOOK = fileURLToPath(new URL('../../web/public/openings/book.json', import.meta.url))

/** EvalCache in a JSON file, written back after every game. */
class FileEvalCache implements EvalCache {
  private readonly entries: Map<string, PositionEval>
  private readonly path: string

  constructor(path: string) {
    this.path = path
    this.entries = new Map(
      existsSync(path) ? Object.entries(JSON.parse(readFileSync(path, 'utf8'))) : [],
    )
  }

  async get(key: string) {
    return this.entries.get(key)
  }

  async put(key: string, value: PositionEval) {
    this.entries.set(key, value)
  }

  save() {
    writeFileSync(this.path, JSON.stringify(Object.fromEntries(this.entries)))
  }

  get size() {
    return this.entries.size
  }
}

/** Maia's move probabilities, cached in a JSON file like the evaluations. */
async function maiaModel(path: string): Promise<HumanMoveModel & { save(): void }> {
  ort.env.wasm.numThreads = 1
  const session = await ort.InferenceSession.create(MAIA_MODEL, { graphOptimizationLevel: 'basic' })
  const model = new OnnxMaiaModel(ort, session)
  const known: Record<string, number> = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : {}
  const key = (q: MoveProbabilityQuery) => `${q.fen}|${q.move}|${q.eloSelf}|${q.eloOppo}`
  return {
    name: 'Maia-3',
    async moveProbabilities(queries) {
      const missing = queries.filter((q) => !(key(q) in known))
      const found = await moveProbabilities(model, missing)
      missing.forEach((q, i) => (known[key(q)] = found[i]!))
      return queries.map((q) => known[key(q)]!)
    },
    save: () => writeFileSync(path, JSON.stringify(known)),
  }
}

interface MoveDetail {
  ply: number
  san: string
  classification: MoveClass
  facts: MoveFacts
  /** The engine's preferred move, in SAN. */
  best?: string
}

interface GameResult {
  index: number
  target: number
  targetSan: string
  targetClass: MoveClass
  brilliant: number[]
  great: number
  moves: number
  /** chess.com's brilliant and every move we called brilliant, for looking into the rules. */
  details: MoveDetail[]
}

async function main() {
  const [datasetPath] = positionals
  if (!datasetPath) throw new Error('usage: review-bench <dataset.json> [--split tune|check|all]')
  const dataset: { pgn: string; ply: string | number }[] = JSON.parse(
    readFileSync(datasetPath, 'utf8'),
  )
  const nodes = Number(args.nodes)
  mkdirSync(BENCH_DIR, { recursive: true })
  const cache = new FileEvalCache(`${BENCH_DIR}evals-${nodes}.json`)
  const book = createOpeningBook(JSON.parse(readFileSync(BOOK, 'utf8')))
  const engines = Array.from(
    { length: Number(args.parallel) },
    () =>
      new UciEngine(
        () => createProcessTransport(resolveStockfishPath(process.env.STOCKFISH_PATH)),
        { hashMb: 16 },
      ),
  )
  const evaluator = new EnginePoolEvaluator(engines)
  const humanMoves = args['no-maia'] ? undefined : await maiaModel(`${BENCH_DIR}maia.json`)
  const picked = dataset
    .map((entry, index) => ({ ...entry, index }))
    .filter(
      ({ index }) =>
        args.split === 'all' || (args.split === 'tune' ? index % 2 === 0 : index % 2 === 1),
    )

  const started = Date.now()
  const cachedBefore = cache.size
  const results: GameResult[] = []
  const dumped: (MoveFacts & { game: number; ply: number; brilliant: boolean })[] = []
  for (const entry of picked) {
    const { game, headers } = importPgn(entry.pgn)
    game.toStart()
    const line = game.line()
    const rating = (tag: string) => (Number(headers[tag]) > 0 ? Number(headers[tag]) : undefined)
    const ratings = { white: rating('WhiteElo'), black: rating('BlackElo') }
    const review = await reviewGame(
      { evaluator, cache, book, ...(humanMoves && { humanMoves }) },
      {
        startFen: game.root.fen,
        moves: line.map((node) => node.move!.uci),
        ratings: Object.fromEntries(Object.entries(ratings).filter(([, r]) => r !== undefined)),
      },
      { nodes },
    )
    const target = Number(entry.ply)
    if (args.dump) {
      for (const m of review.moves) {
        dumped.push({ ...m.facts, game: entry.index, ply: m.ply, brilliant: m.ply === target })
      }
    }
    results.push({
      index: entry.index,
      target,
      targetSan: line[target - 1]?.move?.san ?? '?',
      targetClass: review.moves[target - 1]!.classification,
      brilliant: review.moves.filter((m) => m.classification === 'brilliant').map((m) => m.ply),
      great: review.moves.filter((m) => m.classification === 'great').length,
      moves: review.moves.length,
      details: review.moves
        .filter((m) => m.ply === target || m.classification === 'brilliant')
        .map((m) => ({
          ply: m.ply,
          san: m.san,
          classification: m.classification,
          facts: m.facts,
          ...(m.best && { best: m.best.san }),
        })),
    })
    if (cache.size !== cachedBefore) cache.save()
    humanMoves?.save()
    process.stdout.write(
      `\r${results.length}/${picked.length} games (${Math.round((Date.now() - started) / 1000)}s)`,
    )
  }
  for (const engine of engines) engine.dispose()
  report(results)
  if (args.out) writeFileSync(args.out, JSON.stringify(results, null, 1))
  if (args.dump) writeFileSync(args.dump, JSON.stringify(dumped))
}

function report(results: GameResult[]) {
  const found = results.filter((r) => r.targetClass === 'brilliant').length
  const calls = results.reduce((sum, r) => sum + r.brilliant.length, 0)
  const others = calls - found
  const moves = results.reduce((sum, r) => sum + r.moves, 0)
  const greats = results.reduce((sum, r) => sum + r.great, 0)
  const instead = new Map<MoveClass, number>()
  for (const r of results) instead.set(r.targetClass, (instead.get(r.targetClass) ?? 0) + 1)

  console.log(`\n\nsplit ${args.split}: ${results.length} games, ${moves} moves`)
  console.log(
    `found:      ${found}/${results.length} chess.com brilliants (${pct(found, results.length)})`,
  )
  console.log(
    `precision:  ${calls ? pct(found, calls) : '–'} of our ${calls} brilliant calls are chess.com's`,
  )
  console.log(
    `unconfirmed: ${others} other moves called brilliant (${((others / (moves - results.length)) * 1000).toFixed(1)} per 1000 moves)`,
  )
  console.log(`greats:     ${(greats / results.length).toFixed(2)} per game`)
  console.log(
    `chess.com brilliants got: ${[...instead]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c} ${n}`)
      .join(', ')}`,
  )
}

const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(0)}%`

await main()
process.exit(0)
