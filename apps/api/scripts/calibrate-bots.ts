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
 * Human-like play (Maia, `bun run maia:fetch`): --human-levels lets the levels with a human style
 * play as in the app with the server's model; --human 1100:1:0.98,1900:0.6:0.98 adds players with
 * those settings (rating:temperature:top-p), e.g. to find the settings for a target rating. Their
 * games are judged by a short engine search, so clearly decided games still end early. Maia runs
 * on the script's one thread: --shard 1/8 plays every 8th game, so several processes share the
 * work (fit their result files together with --refit).
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
import { UciEngine, whiteWinChance, type EngineProvider } from '@pawnia/analysis'
import { OnnxMaiaModel } from '@pawnia/maia'
import {
  BOT_LEVELS,
  MATCH_OPENINGS,
  botPlayer,
  enginePlayer,
  estimateRatings,
  playBotMatch,
  sampleHumanMove,
  seededRandom,
  type BotLevel,
  type HumanMovePolicy,
  type HumanStyle,
  type MatchGame,
  type MatchPlayer,
} from '@pawnia/play'
import * as ort from 'onnxruntime-web'
import { createProcessTransport } from '../src/adapters/engine/processTransport'
import { defaultPoolSize, resolveStockfishPath } from '../src/adapters/engine/native'
import { BUNDLED_MAIA } from '../src/adapters/humanMoves/maia'
import { MaiaHumanMoveService } from '../src/adapters/humanMoves/service'

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
    /** Levels with a human style play human-like (Maia), as in the app with the server's model. */
    'human-levels': { type: 'boolean', default: false },
    /** Extra human-like players, "rating:temperature:top-p,…". */
    human: { type: 'string' },
    /** Games per pairing with an anchor (default: --games). */
    'anchor-games': { type: 'string' },
    /** Search for judging human-like moves (only to end decided games early). */
    'judge-nodes': { type: 'string', default: '20000' },
    /** "i/n": play only every n-th game, starting with the i-th (1-based). */
    shard: { type: 'string' },
  },
})

type Side =
  | { kind: 'level'; level: BotLevel }
  | { kind: 'anchor'; elo: number }
  | { kind: 'human'; style: HumanStyle }
interface Job {
  white: Side
  black: Side
  opening: number
  seed: number
}

const anchors = args.anchors.split(',').map(Number)
const anchorName = (elo: number) => `stockfish-${elo}`
const humanStyles: HumanStyle[] = (args.human ? args.human.split(',') : []).map((spec) => {
  const [elo, temperature, topP] = spec.split(':').map(Number)
  return { elo: elo!, temperature: temperature ?? 1, topP: topP ?? 0.98 }
})
const humanLevel = (level: BotLevel) => args['human-levels'] && level.human !== undefined

function nameOf(side: Side): string {
  if (side.kind === 'anchor') return anchorName(side.elo)
  if (side.kind === 'human') {
    const { elo, temperature, topP } = side.style
    return `maia-${elo}-t${temperature}-p${topP}`
  }
  return `level-${side.level.level}${humanLevel(side.level) ? '-human' : ''}`
}

/** Where a player probably stands, only used to pick who meets whom. */
const guess = (() => {
  const prior = args.prior ? fit(JSON.parse(readFileSync(args.prior, 'utf8'))) : {}
  return (side: Side): number => {
    const measured = prior[nameOf(side)]?.rating
    if (measured !== undefined) return measured
    if (side.kind === 'anchor') return side.elo
    if (side.kind === 'level') {
      return side.level.rating ?? 600 + ((side.level.level - 1) * 1800) / (BOT_LEVELS.length - 1)
    }
    // Maia measured sampled: rating 1100 played ~1380, 1900 ~1730; colder plays stronger.
    const { elo, temperature } = side.style
    return 1380 + (elo - 1100) * 0.44 + 300 * (1 - temperature)
  }
})()

/** Each player meets the next two by strength; each anchor the players closest to it. */
function pairings(): [Side, Side][] {
  const players: Side[] = [
    ...(args['skip-levels'] ? [] : BOT_LEVELS.map((level): Side => ({ kind: 'level', level }))),
    ...humanStyles.map((style): Side => ({ kind: 'human', style })),
  ].sort((a, b) => guess(a) - guess(b))
  const pairs: [Side, Side][] = []
  for (const elo of anchors) {
    const anchor: Side = { kind: 'anchor', elo }
    const nearest = [...players].sort((a, b) => Math.abs(guess(a) - elo) - Math.abs(guess(b) - elo))
    for (const player of nearest.slice(0, Number(args['anchor-opponents']))) {
      pairs.push([player, anchor])
    }
  }
  for (const [i, a] of players.entries()) {
    for (const b of players.slice(i + 1, i + 3)) pairs.push([a, b])
  }
  return pairs
}

/** Anchor games first: they take longest, so shards start them early. */
function jobs(gamesPerPairing: number): Job[] {
  const all = pairings().flatMap(([a, b], pair) => {
    const anchorGame = a.kind === 'anchor' || b.kind === 'anchor'
    const count = anchorGame ? Number(args['anchor-games'] ?? gamesPerPairing) : gamesPerPairing
    return Array.from({ length: count }, (_, game) => {
      const swap = game % 2 === 1
      return {
        white: swap ? b : a,
        black: swap ? a : b,
        opening: Math.floor(game / 2) % MATCH_OPENINGS.length,
        seed: pair * 10_000 + game,
      }
    })
  })
  if (!args.shard) return all
  const [index, count] = args.shard.split('/').map(Number)
  return all.filter((_, i) => i % count! === index! - 1)
}

/** Maia for human-like players, loaded once per process (only if needed). */
let maia: HumanMovePolicy | undefined
async function humanPolicy(): Promise<HumanMovePolicy> {
  if (!maia) {
    ort.env.wasm.numThreads = 1
    const session = await ort.InferenceSession.create(BUNDLED_MAIA, {
      graphOptimizationLevel: 'basic',
    })
    const service = new MaiaHumanMoveService(async () => new OnnxMaiaModel(ort, session))
    maia = { name: 'Maia-3', predict: (request) => service.predict(request) }
  }
  return maia
}

/** A human-like player with the given settings, as `chooseBotMove` plays a human-like level. */
function humanPlayer(name: string, policy: HumanMovePolicy, style: HumanStyle, seed: number) {
  const random = seededRandom(seed)
  return {
    name,
    async move(fen: string) {
      const prediction = await policy.predict({ fen, eloSelf: style.elo, eloOppo: style.elo })
      const move = sampleHumanMove(prediction.moves, style, random)
      if (!move) throw new Error(`${name} found no move in ${fen}`)
      return { move }
    },
  } satisfies MatchPlayer
}

/** Adds an engine's view of the position to a player that reports none, for adjudication. */
function judged(player: MatchPlayer, judge: EngineProvider): MatchPlayer {
  return {
    name: player.name,
    async move(fen) {
      const played = await player.move(fen)
      if (played.whiteWinChance !== undefined) return played
      const nodes = Number(args['judge-nodes'])
      const { lines } = await judge.analyze({ fen, nodes, fresh: true }).result
      const score = lines[0]?.score
      return { ...played, ...(score && { whiteWinChance: whiteWinChance(score) }) }
    },
  }
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
    async player(side: Side, seed: number): Promise<MatchPlayer> {
      if (side.kind === 'human') {
        return judged(humanPlayer(nameOf(side), await humanPolicy(), side.style, seed), bot)
      }
      if (side.kind === 'level') {
        if (!humanLevel(side.level)) return botPlayer(bot, side.level, seed)
        const player = botPlayer(bot, side.level, seed, await humanPolicy())
        return judged({ ...player, name: nameOf(side) }, bot)
      }
      let engine = anchorEngines.get(side.elo)
      if (!engine) {
        engine = start([native, []], { UCI_LimitStrength: true, UCI_Elo: side.elo })
        anchorEngines.set(side.elo, engine)
      }
      return enginePlayer(nameOf(side), engine, { movetimeMs: Number(args['anchor-ms']) })
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
            white: await engines.player(job.white, job.seed),
            black: await engines.player(job.black, job.seed + 1),
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
