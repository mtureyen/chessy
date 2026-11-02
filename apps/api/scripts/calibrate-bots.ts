/**
 * Measures the bot levels: plays them against each other and against Stockfish set to fixed
 * UCI_Elo values (the anchors), then estimates a rating per level.
 *
 * The bots think on the same engine as in the browser (Stockfish.js lite, run by Node; fetch it
 * with `bun run --cwd apps/web engine:fetch`), so the ratings fit the bots people play. The
 * anchors run on the native engine (`bun run engine:native`).
 *
 *   bun run bots:calibrate [--games 40] [--anchors 1500,2000,2500] [--anchor-ms 1000]
 *                          [--anchor-opponents 2] [--skip-levels] [--parallel 8]
 *                          [--out calibration.json] [--prior calibration.json]
 *                          [--bot-engine lite|native]
 *   bun run bots:calibrate --refit round1.json,anchors.json   (only fit saved games)
 *
 * Results are saved after every game, so a stopped run keeps what it played. Slow anchor games
 * can be played separately (--skip-levels) and fitted together with the level games (--refit).
 *
 * The anchors' UCI_Elo is calibrated against engine rating lists at longer time controls, so the
 * ratings are an estimate; the distances between the levels are the reliable part.
 */
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { UciEngine, type EngineProvider } from '@chessy/analysis'
import {
  BOT_LEVELS,
  MATCH_OPENINGS,
  botPlayer,
  enginePlayer,
  estimateRatings,
  playBotMatch,
  type BotLevel,
  type MatchGame,
  type MatchPlayer,
} from '@chessy/play'
import { createProcessTransport } from '../src/adapters/engine/processTransport'
import { defaultPoolSize, resolveStockfishPath } from '../src/adapters/engine/native'

const { values: args } = parseArgs({
  options: {
    games: { type: 'string', default: String(MATCH_OPENINGS.length * 2) },
    anchors: { type: 'string', default: '1500,2000,2500' },
    'anchor-ms': { type: 'string', default: '1000' },
    parallel: { type: 'string', default: String(defaultPoolSize()) },
    out: { type: 'string', default: 'calibration.json' },
    /** Comma-separated result files to fit together, without playing. */
    refit: { type: 'string' },
    /** How many levels (the closest) each anchor plays. */
    'anchor-opponents': { type: 'string', default: '2' },
    /** Only the anchor games, e.g. to add them to level games played before. */
    'skip-levels': { type: 'boolean', default: false },
    /** Earlier results: each anchor then meets the levels measured closest to it. */
    prior: { type: 'string' },
    'bot-engine': { type: 'string', default: 'lite' },
  },
})

type Side = { kind: 'level'; level: BotLevel } | { kind: 'anchor'; elo: number }
interface Job {
  white: Side
  black: Side
  opening: number
  seed: number
}

const anchors = args.anchors.split(',').map(Number)
const anchorName = (elo: number) => `stockfish-${elo}`

/** Where each level probably stands, only used to pick which levels meet which anchor. */
const guess = (() => {
  if (!args.prior)
    return (level: BotLevel) => 600 + ((level.level - 1) * 1800) / (BOT_LEVELS.length - 1)
  const prior = fit(JSON.parse(readFileSync(args.prior, 'utf8')))
  return (level: BotLevel) => prior[`level-${level.level}`]?.rating ?? 1500
})()

function pairings(): [Side, Side][] {
  const level = (l: BotLevel): Side => ({ kind: 'level', level: l })
  const pairs: [Side, Side][] = []
  for (const [i, a] of args['skip-levels'] ? [] : BOT_LEVELS.entries()) {
    for (const b of BOT_LEVELS.slice(i + 1, i + 3)) pairs.push([level(a), level(b)])
  }
  for (const elo of anchors) {
    const nearest = [...BOT_LEVELS].sort(
      (a, b) => Math.abs(guess(a) - elo) - Math.abs(guess(b) - elo),
    )
    for (const l of nearest.slice(0, Number(args['anchor-opponents']))) {
      pairs.push([level(l), { kind: 'anchor', elo }])
    }
  }
  return pairs
}

function jobs(gamesPerPairing: number): Job[] {
  return pairings().flatMap(([a, b], pair) =>
    Array.from({ length: gamesPerPairing }, (_, game) => {
      const swap = game % 2 === 1
      return {
        white: swap ? b : a,
        black: swap ? a : b,
        opening: Math.floor(game / 2) % MATCH_OPENINGS.length,
        seed: pair * 10_000 + game,
      }
    }),
  )
}

/** The browser's engine files, served by the web app (fetched and checksum-verified there). */
const LITE_ENGINE = fileURLToPath(
  new URL('../../web/public/engine/stockfish-19-lite-single', import.meta.url),
)

/**
 * The command that runs the lite engine as a UCI process. Node needs the script as CommonJS,
 * and the web app's package marks .js files as modules, so both files go to a folder of their own.
 */
function liteEngineCommand(): [string, string[]] {
  const dir = mkdtempSync(join(tmpdir(), 'chessy-lite-engine-'))
  copyFileSync(`${LITE_ENGINE}.js`, join(dir, 'stockfish.cjs'))
  copyFileSync(`${LITE_ENGINE}.wasm`, join(dir, 'stockfish.wasm'))
  return ['node', [join(dir, 'stockfish.cjs')]]
}

/** One worker's engines: one for the bots, one per anchor strength (set at load). */
function workerEngines(native: string, botCommand: [string, string[]]) {
  const start = ([command, commandArgs]: [string, string[]], setOptions = {}) =>
    new UciEngine(() => createProcessTransport(command, commandArgs), {
      hashMb: 16,
      initTimeoutMs: 10_000,
      setOptions,
    })
  const bot = start(botCommand)
  const anchorEngines = new Map<number, EngineProvider>()
  return {
    player(side: Side, seed: number): MatchPlayer {
      if (side.kind === 'level') return botPlayer(bot, side.level, seed)
      let engine = anchorEngines.get(side.elo)
      if (!engine) {
        engine = start([native, []], { UCI_LimitStrength: true, UCI_Elo: side.elo })
        anchorEngines.set(side.elo, engine)
      }
      return enginePlayer(anchorName(side.elo), engine, { movetimeMs: Number(args['anchor-ms']) })
    },
    dispose() {
      bot.dispose()
      for (const engine of anchorEngines.values()) engine.dispose()
    },
  }
}

async function play(): Promise<MatchGame[]> {
  const native = resolveStockfishPath(process.env.STOCKFISH_PATH)
  const botCommand: [string, string[]] =
    args['bot-engine'] === 'native' ? [native, []] : liteEngineCommand()
  const queue = jobs(Number(args.games))
  const total = queue.length
  const results: MatchGame[] = []
  const started = Date.now()
  console.log(
    `${total} games, ${args.parallel} at a time; bots: ${args['bot-engine']}, anchors: ${native}`,
  )

  const worker = async () => {
    const engines = workerEngines(native, botCommand)
    try {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const game = await playBotMatch(
          {
            white: engines.player(job.white, job.seed),
            black: engines.player(job.black, job.seed + 1),
          },
          MATCH_OPENINGS[job.opening]!.moves,
        )
        results.push(game)
        writeFileSync(args.out, JSON.stringify(results, null, 1))
        const seconds = Math.round((Date.now() - started) / 1000)
        console.log(
          `${results.length}/${total}  ${game.white} - ${game.black}  ${game.result}  ${game.ending}, ${game.plies} plies  (${seconds}s)`,
        )
      }
    } finally {
      engines.dispose()
    }
  }
  await Promise.all(Array.from({ length: Number(args.parallel) }, worker))
  return results
}

function fit(games: MatchGame[]) {
  const scores = { '1-0': 1, '0-1': 0, '1/2-1/2': 0.5 } as const
  const anchorNames = new Set(
    games.flatMap((g) => [g.white, g.black]).filter((n) => n.startsWith('stockfish-')),
  )
  return estimateRatings(
    games.map((g) => ({ white: g.white, black: g.black, score: scores[g.result] })),
    Object.fromEntries(
      [...anchorNames].map((name) => [name, Number(name.slice('stockfish-'.length))]),
    ),
  )
}

function report(games: MatchGame[]) {
  const ratings = fit(games)
  const rows = Object.entries(ratings).sort(([, a], [, b]) => a.rating - b.rating)
  console.log('\nplayer          rating      ±   games  score')
  for (const [name, r] of rows) {
    console.log(
      `${name.padEnd(15)} ${Math.round(r.rating).toString().padStart(6)}  ${Math.round(r.error).toString().padStart(5)}  ${String(r.games).padStart(6)}  ${(r.score * 100).toFixed(0).padStart(4)}%`,
    )
  }
  const endings = games.reduce<Record<string, number>>(
    (acc, g) => ({ ...acc, [g.ending]: (acc[g.ending] ?? 0) + 1 }),
    {},
  )
  console.log(`\nendings: ${JSON.stringify(endings)}`)
}

const games: MatchGame[] = args.refit
  ? args.refit.split(',').flatMap((file) => JSON.parse(readFileSync(file, 'utf8')) as MatchGame[])
  : await play()
report(games)
process.exit(0)
