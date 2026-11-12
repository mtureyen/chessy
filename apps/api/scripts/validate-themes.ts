/**
 * Measures the theme tagger against lichess' own labels: per theme, how many of the puzzles it
 * tags carry that theme at lichess (precision) and how many of lichess' it finds (recall).
 *
 *   bun scripts/validate-themes.ts                    the held-out quarter of the sample
 *   bun scripts/validate-themes.ts --set tune         the three quarters to tune on
 *   bun scripts/validate-themes.ts --show fork --errors wrong --limit 20
 *                                                     puzzles tagged `fork` that lichess doesn't
 *                                                     (`--errors missed`: the other way round)
 *   bun scripts/validate-themes.ts --engine 2000      the same question for engine lines, below
 *                                                     (`--min-gain 1`: with another threshold)
 *
 * The sample is the start of lichess' puzzle database (CC0, database.lichess.org), read once by
 * HTTP range and kept in .bench/: the file is sorted by puzzle id, which is random, so its first
 * megabytes are as good as any. lichess' labels are its tagger's output corrected by its users'
 * votes, so even a faithful port doesn't reach 100 %.
 *
 * `--engine <count>` asks what a game review has to work with: instead of the puzzle's solution,
 * the first <count> puzzles get the line Stockfish finds in the puzzle's position with a review's
 * budget (needs `bun run engine:native`; lines are kept in .bench/). The table then compares the
 * themes of that line, as it is and cut by `cutEngineLine`, with lichess' labels. A theme that
 * holds up there can be trusted on the mistakes of a reviewed game. Precision is a lower bound
 * here: the engine's line often runs a move past the puzzle's solution, to the capture that
 * completes a skewer or the pawn that queens, and lichess' labels don't have what comes after.
 */
import {
  allThemes,
  cutEngineLine,
  MIN_GAIN,
  THEMES,
  TRUSTED_THEMES,
  type TacticLine,
  type Theme,
} from '@pawnia/analysis'
import { createGame } from '@pawnia/chess'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createZstdDecompress } from 'node:zlib'
import {
  createNativeEngineService,
  defaultPoolSize,
  resolveStockfishPath,
} from '../src/adapters/engine/native'

const SOURCE = 'https://database.lichess.org/lichess_db_puzzle.csv.zst'
/** About 160,000 puzzles. */
const SAMPLE_BYTES = 8 * 1024 * 1024
/** Every fourth puzzle is held out: looked at only to report, never to tune. */
const HELD_OUT_EVERY = 4
const LENGTHS = ['oneMove', 'short', 'long', 'veryLong']
/** What a review searches per position, and how much of the line it keeps. */
const REVIEW_NODES = 1_500_000
const REVIEW_MULTI_PV = 2
const REVIEW_LINE_MOVES = 8

const cacheDir = fileURLToPath(new URL('../.bench/', import.meta.url))
const sampleFile = `${cacheDir}lichess-puzzles.csv.zst.part`
const linesFile = `${cacheDir}lichess-puzzles-engine-lines.json`

interface Row {
  id: string
  fen: string
  moves: string[]
  themes: Set<string>
}

async function sampleBytes(): Promise<Uint8Array> {
  const cached = await readFile(sampleFile).catch(() => undefined)
  if (cached) return cached
  const res = await fetch(SOURCE, { headers: { Range: `bytes=0-${SAMPLE_BYTES - 1}` } })
  if (res.status !== 206) throw new Error(`Range request failed: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  await mkdir(cacheDir, { recursive: true })
  await writeFile(sampleFile, bytes)
  return bytes
}

async function readSample(): Promise<Row[]> {
  const zstd = createZstdDecompress()
  // The piece ends inside a frame: decoding fails there, after everything before it came out.
  zstd.on('error', () => zstd.push(null))
  Readable.from([await sampleBytes()]).pipe(zstd)
  const rows: Row[] = []
  let pending: Row | undefined
  let header = true
  for await (const line of createInterface({ input: zstd, crlfDelay: Infinity })) {
    if (header) {
      header = false
      continue
    }
    // A row counts once the next one starts: the last may be cut off.
    if (pending) rows.push(pending)
    const [id = '', fen = '', moves = '', , , , , themes = ''] = line.split(',')
    pending = { id, fen, moves: moves.split(' '), themes: new Set(themes.split(' ')) }
  }
  return rows
}

/** The engine's line in each puzzle's position (after the opponent's first move), by puzzle id. */
async function engineLines(rows: readonly Row[]): Promise<Map<string, string[]>> {
  const cached = await readFile(linesFile, 'utf8').catch(() => undefined)
  const known = new Map<string, string[]>(cached ? Object.entries(JSON.parse(cached)) : [])
  const missing = rows.filter((row) => !known.has(row.id))
  if (missing.length > 0) {
    const engine = createNativeEngineService({
      path: resolveStockfishPath(process.env.STOCKFISH_PATH),
      poolSize: defaultPoolSize(),
      hashMb: 64,
    })
    const fens = missing.map((row) => createGame(row.fen).play(row.moves[0]!)!.fen)
    let done = 0
    const evals = await engine.evaluate(
      { fens, nodes: REVIEW_NODES, multiPv: REVIEW_MULTI_PV },
      {
        onEvaluated: () => {
          if (++done % 250 === 0) console.error(`engine: ${done}/${missing.length}`)
        },
      },
    )
    missing.forEach((row, i) =>
      known.set(row.id, evals[i]?.lines[0]?.pv.slice(0, REVIEW_LINE_MOVES) ?? []),
    )
    await writeFile(linesFile, JSON.stringify(Object.fromEntries(known)))
  }
  return known
}

class Tally {
  private readonly counts = new Map<Theme, { lichess: number; tagged: number; both: number }>(
    THEMES.map((theme) => [theme, { lichess: 0, tagged: 0, both: 0 }]),
  )

  add(tagged: ReadonlySet<Theme>, lichess: ReadonlySet<string>): void {
    for (const [theme, count] of this.counts) {
      if (lichess.has(theme)) count.lichess++
      if (tagged.has(theme)) count.tagged++
      if (tagged.has(theme) && lichess.has(theme)) count.both++
    }
  }

  /** `lichess  tagged  precision  recall`, in fixed columns. */
  row(theme: Theme, withLichess = true): string {
    const { lichess, tagged, both } = this.counts.get(theme)!
    const percent = (part: number, whole: number) =>
      whole === 0 ? '    –' : ((100 * part) / whole).toFixed(1).padStart(5)
    return (
      (withLichess ? String(lichess).padStart(8) : '') +
      `${String(tagged).padStart(8)}  ${percent(both, tagged)}   ${percent(both, lichess)}`
    )
  }
}

/** Marks the themes `tagThemes` returns. */
function trusted(theme: Theme): string {
  return TRUSTED_THEMES.includes(theme) ? '   trusted' : ''
}

const { values: args } = parseArgs({
  options: {
    set: { type: 'string', default: 'held-out' },
    show: { type: 'string' },
    errors: { type: 'string', default: 'wrong' },
    limit: { type: 'string', default: '20' },
    engine: { type: 'string' },
    'min-gain': { type: 'string', default: String(MIN_GAIN) },
  },
})

const sample = await readSample()
const inSet = sample.filter((_, index) => {
  if (args.set === 'all') return true
  return (index % HELD_OUT_EVERY === HELD_OUT_EVERY - 1) === (args.set === 'held-out')
})
// lichess' tagger gives every puzzle a length; one without hasn't been through it yet (about
// 1 %, labelled with the game phase only) and would count every theme found as wrong.
const tagged = inSet.filter((row) => LENGTHS.some((length) => row.themes.has(length)))
const rows = args.engine ? tagged.slice(0, Number(args.engine)) : tagged
console.log(
  `${rows.length} puzzles (${args.set}) of ${sample.length} sampled; ` +
    `${inSet.length - tagged.length} not yet tagged by lichess left out\n`,
)

const examples: string[] = []
function note(row: Row, line: TacticLine | undefined, found: ReadonlySet<Theme>): void {
  const theme = args.show as Theme | undefined
  if (!theme || found.has(theme) === row.themes.has(theme)) return
  if (found.has(theme) !== (args.errors === 'wrong')) return
  examples.push(
    `https://lichess.org/training/${row.id}  ${row.fen}  ${row.moves.join(' ')}\n` +
      (line ? `    line:    ${line.moves.join(' ')}\n` : '') +
      `    lichess: ${[...row.themes].join(' ')}\n    tagger:  ${[...found].join(' ')}`,
  )
}

if (args.engine) {
  const lines = await engineLines(rows)
  const uncut = new Tally()
  const cut = new Tally()
  let sameFirstMove = 0
  let kept = 0
  for (const row of rows) {
    const pv = lines.get(row.id) ?? []
    const line = { fen: row.fen, moves: [row.moves[0]!, ...pv] }
    if (pv[0] === row.moves[1]) sameFirstMove++
    uncut.add(new Set(allThemes(line)), row.themes)
    const tactic = cutEngineLine(line, Number(args['min-gain']))
    if (tactic) kept++
    const found = new Set(tactic ? allThemes(tactic) : [])
    cut.add(found, row.themes)
    note(row, tactic, found)
  }
  console.log(
    `engine lines: ${sameFirstMove} start with the puzzle's move, ` +
      `${kept} win enough to be kept by the cut\n`,
  )
  console.log(`${''.padEnd(28)}  ${'whole line'.padEnd(22)}  cut line`)
  console.log(
    `${'theme'.padEnd(20)}${'lichess'.padStart(8)}${`${'tagged'.padStart(8)}  prec.  recall`.repeat(2)}`,
  )
  for (const theme of THEMES) {
    console.log(`${theme.padEnd(20)}${uncut.row(theme)}${cut.row(theme, false)}${trusted(theme)}`)
  }
} else {
  const tally = new Tally()
  for (const row of rows) {
    const found = new Set(allThemes({ fen: row.fen, moves: row.moves }))
    tally.add(found, row.themes)
    note(row, undefined, found)
  }
  console.log(`${'theme'.padEnd(20)}${'lichess'.padStart(8)}${'tagged'.padStart(8)}  prec.  recall`)
  for (const theme of THEMES) console.log(`${theme.padEnd(20)}${tally.row(theme)}${trusted(theme)}`)
}

if (args.show) {
  console.log(`\n${args.show}, ${args.errors}: ${examples.length}`)
  for (const example of examples.slice(0, Number(args.limit))) console.log(example)
}
// The engine pool keeps the process alive.
process.exit(0)
