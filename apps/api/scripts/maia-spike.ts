/**
 * Prototype measurements for Maia-3 (human-like moves), on the same WebAssembly runtime the
 * browser would use (onnxruntime-web, single-threaded):
 *
 *   bun run maia:spike latency
 *   bun run maia:spike match <games.json>     move match on real games ({ pgn }[], with Elo tags)
 *   bun run maia:spike strength [--games 20] [--out maia-strength.json]
 *                                             Maia at fixed ratings against the calibrated levels
 *
 * Needs the model (`bun run maia:fetch`); `match` also compares with the native Stockfish's best
 * move and `strength` runs the levels on the browser's engine, both as in calibrate-bots.ts.
 */
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import * as ort from 'onnxruntime-web'
import { UciEngine } from '@chessy/analysis'
import { importPgn } from '@chessy/chess'
import { OnnxMaiaModel, predictHumanMoves, type MaiaModel } from '@chessy/maia'
import {
  BOT_LEVELS,
  MATCH_OPENINGS,
  botPlayer,
  estimateRatings,
  pickWeighted,
  playBotMatch,
  seededRandom,
  type MatchGame,
  type MatchPlayer,
} from '@chessy/play'
import { createProcessTransport } from '../src/adapters/engine/processTransport'
import { resolveStockfishPath } from '../src/adapters/engine/native'
import { BUNDLED_MAIA as MAIA_MODEL } from '../src/adapters/humanMoves/maia'

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    games: { type: 'string', default: '20' },
    parallel: { type: 'string', default: '8' },
    out: { type: 'string', default: 'calibration-maia.json' },
  },
})

async function loadModel(): Promise<MaiaModel> {
  ort.env.wasm.numThreads = 1
  // 'basic', as the Maia platform found: 'all' shifts the probabilities slightly.
  const session = await ort.InferenceSession.create(MAIA_MODEL, { graphOptimizationLevel: 'basic' })
  return new OnnxMaiaModel(ort, session)
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!

async function latency(model: MaiaModel) {
  const fens = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    '2rq1rk1/pp1bbppp/2n1pn2/3p4/2PP4/2N1PN2/PP1B1PPP/R2QKB1R b KQ - 3 9',
  ]
  const single: number[] = []
  for (let i = 0; i < 60; i++) {
    const started = performance.now()
    await predictHumanMoves(model, [{ fen: fens[i % fens.length]!, eloSelf: 1500 }])
    if (i >= 10) single.push(performance.now() - started) // the first runs warm up
  }
  const batch = Array.from({ length: 32 }, (_, i) => ({
    fen: fens[i % fens.length]!,
    eloSelf: 1100 + (i % 10) * 100,
  }))
  const batched: number[] = []
  for (let i = 0; i < 10; i++) {
    const started = performance.now()
    await predictHumanMoves(model, batch)
    batched.push(performance.now() - started)
  }
  console.log(`one position: median ${median(single).toFixed(1)} ms`)
  console.log(
    `batch of 32: median ${median(batched).toFixed(0)} ms (${(median(batched) / 32).toFixed(1)} ms per position)`,
  )
  const [prediction] = await predictHumanMoves(model, [{ fen: fens[0]!, eloSelf: 1500 }])
  console.log(
    'start position at 1500:',
    prediction!.moves
      .slice(0, 5)
      .map((m) => `${m.move} ${(m.probability * 100).toFixed(0)}%`)
      .join(', '),
  )
}

/** Which rating band a player belongs to, for the report. */
const band = (elo: number) =>
  elo < 1100 ? '<1100' : elo < 1500 ? '1100–1499' : elo < 1900 ? '1500–1899' : '≥1900'

async function match(model: MaiaModel, file: string) {
  const games: { pgn: string }[] = JSON.parse(readFileSync(file, 'utf8'))
  const engines = Array.from(
    { length: Number(args.parallel) },
    () =>
      new UciEngine(
        () => createProcessTransport(resolveStockfishPath(process.env.STOCKFISH_PATH)),
        { hashMb: 16 },
      ),
  )
  const stats = new Map<
    string,
    { moves: number; maia: number; maiaTop3: number; stockfish: number }
  >()
  let skipped = 0
  for (const [n, entry] of games.entries()) {
    const { game, headers } = importPgn(entry.pgn)
    const elo = { white: Number(headers.WhiteElo), black: Number(headers.BlackElo) }
    if (!elo.white || !elo.black) {
      skipped++
      continue
    }
    game.toStart()
    const line = game.line()
    const positions = line.map((node) => ({
      fen: node.parent!.fen,
      played: node.move!.uci,
      mover: node.move!.color,
    }))
    const predictions = await predictHumanMoves(
      model,
      positions.map((p) => ({
        fen: p.fen,
        eloSelf: elo[p.mover],
        eloOppo: elo[p.mover === 'white' ? 'black' : 'white'],
      })),
    )
    const best: string[] = []
    let next = 0
    await Promise.all(
      engines.map(async (engine) => {
        for (let i = next++; i < positions.length; i = next++) {
          const result = await engine.analyze({
            fen: positions[i]!.fen,
            nodes: 100_000,
            fresh: true,
          }).result
          best[i] = result.bestMove ?? ''
        }
      }),
    )
    for (const [i, position] of positions.entries()) {
      const key = band(elo[position.mover])
      const s = stats.get(key) ?? { moves: 0, maia: 0, maiaTop3: 0, stockfish: 0 }
      const ranked = predictions[i]!.moves.map((m) => m.move)
      s.moves++
      if (ranked[0] === position.played) s.maia++
      if (ranked.slice(0, 3).includes(position.played)) s.maiaTop3++
      if (best[i] === position.played) s.stockfish++
      stats.set(key, s)
    }
    process.stdout.write(`\r${n + 1}/${games.length} games`)
  }
  for (const engine of engines) engine.dispose()
  console.log(
    `\n\nmoves played that each predicted as its first choice (skipped ${skipped} games without ratings):`,
  )
  console.log('band         moves   Maia-3   Maia top-3   Stockfish 100k')
  const total = { moves: 0, maia: 0, maiaTop3: 0, stockfish: 0 }
  const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`.padStart(8)
  for (const key of ['<1100', '1100–1499', '1500–1899', '≥1900']) {
    const s = stats.get(key)
    if (!s) continue
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += s[k]
    console.log(
      `${key.padEnd(11)} ${String(s.moves).padStart(6)} ${pct(s.maia, s.moves)} ${pct(s.maiaTop3, s.moves)}    ${pct(s.stockfish, s.moves)}`,
    )
  }
  console.log(
    `${'all'.padEnd(11)} ${String(total.moves).padStart(6)} ${pct(total.maia, total.moves)} ${pct(total.maiaTop3, total.moves)}    ${pct(total.stockfish, total.moves)}`,
  )
}

/** Maia at one rating: samples its move distribution (temperature 1), or always its first choice. */
function maiaPlayer(
  model: MaiaModel,
  elo: number,
  mode: 'sample' | 'top',
  seed: number,
): MatchPlayer {
  const random = seededRandom(seed)
  return {
    name: `maia-${elo}${mode === 'top' ? '-top' : ''}`,
    async move(fen) {
      const [prediction] = await predictHumanMoves(model, [{ fen, eloSelf: elo, eloOppo: elo }])
      const moves = prediction!.moves
      const pick =
        mode === 'top'
          ? 0
          : pickWeighted(
              moves.map((m) => m.probability),
              random,
            )
      return { move: moves[pick]!.move }
    },
  }
}

async function strength(model: MaiaModel) {
  const dir = mkdtempSync(join(tmpdir(), 'chessy-lite-engine-'))
  const lite = fileURLToPath(
    new URL('../../web/public/engine/stockfish-19-lite-single', import.meta.url),
  )
  copyFileSync(`${lite}.js`, join(dir, 'stockfish.cjs'))
  copyFileSync(`${lite}.wasm`, join(dir, 'stockfish.wasm'))
  const level = (n: number) => BOT_LEVELS.find((l) => l.level === n)!
  // Each Maia rating meets the two levels around it; the levels' measured ratings are the anchors.
  const pairings: [number, 'sample' | 'top', number[]][] = [
    [1100, 'sample', [3, 4]],
    [1500, 'sample', [4, 5]],
    [1900, 'sample', [5, 6]],
    [1100, 'top', [3, 4]],
    [1500, 'top', [4, 5]],
    [1900, 'top', [5, 6]],
  ]
  const jobs = pairings.flatMap(([elo, mode, levels], p) =>
    levels.flatMap((n) =>
      Array.from({ length: Number(args.games) }, (_, g) => ({
        elo,
        mode,
        n,
        g,
        seed: p * 1000 + n * 100 + g,
      })),
    ),
  )
  const results: MatchGame[] = []
  const worker = async () => {
    const engine = new UciEngine(
      () => createProcessTransport('node', [join(dir, 'stockfish.cjs')]),
      { hashMb: 16 },
    )
    try {
      for (let job = jobs.shift(); job; job = jobs.shift()) {
        const maia = maiaPlayer(model, job.elo, job.mode, job.seed)
        const bot = botPlayer(engine, level(job.n), job.seed + 1)
        const [white, black] = job.g % 2 ? [bot, maia] : [maia, bot]
        results.push(
          await playBotMatch(
            { white, black },
            MATCH_OPENINGS[Math.floor(job.g / 2) % MATCH_OPENINGS.length]!.moves,
          ),
        )
        writeFileSync(args.out, JSON.stringify(results, null, 1))
        process.stdout.write(`\r${results.length} games`)
      }
    } finally {
      engine.dispose()
    }
  }
  await Promise.all(Array.from({ length: Number(args.parallel) }, worker))
  const scores = { '1-0': 1, '0-1': 0, '1/2-1/2': 0.5 } as const
  const ratings = estimateRatings(
    results.map((g) => ({ white: g.white, black: g.black, score: scores[g.result] })),
    Object.fromEntries(BOT_LEVELS.map((l) => [`level-${l.level}`, l.rating!])),
  )
  console.log('\n\nplayer           rating     ±   games  score')
  for (const [name, r] of Object.entries(ratings).sort(([, a], [, b]) => a.rating - b.rating)) {
    console.log(
      `${name.padEnd(16)} ${Math.round(r.rating).toString().padStart(6)} ${Math.round(r.error).toString().padStart(5)} ${String(r.games).padStart(6)}  ${(r.score * 100).toFixed(0).padStart(4)}%`,
    )
  }
}

const model = await loadModel()
const [command, file] = positionals
if (command === 'latency') await latency(model)
else if (command === 'match' && file) await match(model, file)
else if (command === 'strength') await strength(model)
else console.log('usage: maia-spike latency | match <games.json> | strength [--games 20]')
process.exit(0)
