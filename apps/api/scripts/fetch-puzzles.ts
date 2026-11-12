/**
 * Fetches the puzzle set: a selection of lichess' puzzle database (CC0, database.lichess.org)
 * for the API to hand out by theme and difficulty. Run it yourself: `bun run puzzles:fetch`.
 * Without it the API's puzzle routes answer 503 and say so.
 *
 *   bun run puzzles:fetch [--force] [--megabytes 40] [--per-theme-band 200] [--band-width 100]
 *                         [--min-popularity 85] [--min-plays 500] [--max-deviation 90]
 *                         [--rating-below 2200] [--source <url or file>] [--out <file>]
 *
 * The database is one file of six million puzzles (310 MB) in the order of their random ids, so
 * its start is a fair sample of the whole: only that is read, by HTTP range (as
 * scripts/build-library.ts reads the games). Of those rows the well-liked, often-played ones
 * are kept, thinned out to a number per theme and rating band (see PUZZLE_FILTER and capPuzzles
 * in packages/analysis). --source also takes a local copy of the file, whole or cut off.
 *
 * The checked-in sample for tests (data/puzzle-sample.json) is made by the same script:
 *
 *   bun run puzzles:fetch --megabytes 1 --per-theme-band 1 --band-width 3000 \
 *                         --out data/puzzle-sample.json --force
 */
import {
  capPuzzles,
  formatPuzzleSet,
  isGoodPuzzle,
  packPuzzle,
  parsePuzzleRow,
  PUZZLE_CAP,
  PUZZLE_COLUMNS,
  PUZZLE_FILTER,
  puzzleStart,
  puzzleThemes,
  type PuzzleCap,
  type PuzzleFilter,
  type PuzzleRow,
  type PuzzleSetFile,
} from '@pawnia/analysis'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { parseArgs } from 'node:util'
import { createZstdDecompress } from 'node:zlib'
import { FETCHED_PUZZLE_SET } from '../src/adapters/puzzles/filePuzzleLibrary'

const DATABASE = 'https://database.lichess.org/lichess_db_puzzle.csv.zst'

const { values: args } = parseArgs({
  options: {
    /** Fetch again although the file is there. */
    force: { type: 'boolean', default: false },
    /** How much of the database's start to read. 40 MB hold about 840,000 puzzles. */
    megabytes: { type: 'string', default: '40' },
    'per-theme-band': { type: 'string', default: String(PUZZLE_CAP.perThemeBand) },
    'band-width': { type: 'string', default: String(PUZZLE_CAP.bandWidth) },
    'min-popularity': { type: 'string', default: String(PUZZLE_FILTER.minPopularity) },
    'min-plays': { type: 'string', default: String(PUZZLE_FILTER.minPlays) },
    'max-deviation': { type: 'string', default: String(PUZZLE_FILTER.maxRatingDeviation) },
    'rating-below': { type: 'string', default: String(PUZZLE_FILTER.ratingBelow) },
    source: { type: 'string', default: DATABASE },
    out: { type: 'string', default: FETCHED_PUZZLE_SET },
  },
})

function amount(name: keyof typeof args, min: number): number {
  const value = Number(args[name])
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`--${name} must be a number of at least ${min}, not "${args[name]}"`)
  }
  return value
}

const bytes = Math.round(amount('megabytes', 0.1) * 1024 * 1024)
const filter: PuzzleFilter = {
  minPopularity: amount('min-popularity', -100),
  minPlays: amount('min-plays', 0),
  maxRatingDeviation: amount('max-deviation', 0),
  ratingBelow: amount('rating-below', 1),
}
const cap: PuzzleCap = {
  perThemeBand: Math.floor(amount('per-theme-band', 1)),
  bandWidth: Math.floor(amount('band-width', 1)),
}

/** The start of the database, compressed: from lichess by range, or from a local copy. */
async function readStart(source: string): Promise<{ data: Uint8Array; lastModified?: string }> {
  if (!/^https?:\/\//.test(source)) {
    return { data: new Uint8Array(await readFile(source)).subarray(0, bytes) }
  }
  const res = await fetch(source, { headers: { Range: `bytes=0-${bytes - 1}` } })
  // 200 would be the whole file: a server that ignores ranges isn't asked for 310 MB.
  if (res.status !== 206) throw new Error(`Range request failed: HTTP ${res.status}`)
  const modified = Date.parse(res.headers.get('last-modified') ?? '')
  return {
    data: new Uint8Array(await res.arrayBuffer()),
    ...(Number.isFinite(modified) && { lastModified: new Date(modified).toISOString() }),
  }
}

/**
 * Decompresses and hands out every complete line. The data stops in the middle of a zstd frame
 * and of a row: the decoder's error at the cut ends the reading, and what follows the last line
 * break is dropped.
 */
function eachLine(data: Uint8Array, onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const zstd = createZstdDecompress()
    let rest = ''
    zstd.setEncoding('utf8')
    zstd.on('data', (text: string) => {
      const lines = (rest + text).split('\n')
      rest = lines.pop()!
      for (const line of lines) onLine(line)
    })
    zstd.on('end', resolve)
    zstd.on('error', () => resolve())
    Readable.from([data]).pipe(zstd)
  })
}

async function main() {
  const existing = await stat(args.out).catch(() => undefined)
  if (existing && !args.force) {
    console.log(`puzzles: ${args.out} is already there (--force fetches it again)`)
    return
  }

  const started = Date.now()
  console.log(`puzzles: reading the first ${(bytes / 2 ** 20).toFixed(1)} MB of ${args.source}`)
  const { data, lastModified } = await readStart(args.source)

  let header: string | undefined
  let read = 0
  const good: PuzzleRow[] = []
  await eachLine(data, (line) => {
    if (header === undefined) {
      header = line
      return
    }
    const row = parsePuzzleRow(line)
    if (!row) return
    read++
    // Playing a line through costs the most, so it comes last.
    if (isGoodPuzzle(row, filter) && puzzleStart(row)) good.push(row)
  })
  if (!header?.startsWith(PUZZLE_COLUMNS)) {
    throw new Error(`Not the puzzle database: it starts with "${header?.slice(0, 80)}"`)
  }
  if (read === 0) throw new Error('No puzzles in what was read')

  const kept = capPuzzles(good, cap)
  const file: PuzzleSetFile = {
    version: 1,
    source: {
      url: args.source,
      license: 'CC0-1.0',
      ...(lastModified && { lastModified }),
      fetchedAt: new Date().toISOString(),
      bytes: data.byteLength,
      read,
      good: good.length,
      filter,
      cap,
    },
    puzzles: kept.map(packPuzzle),
  }
  const text = formatPuzzleSet(file)
  await mkdir(dirname(args.out), { recursive: true })
  // Written beside it and moved over: a running API never reads half a file.
  await writeFile(`${args.out}.part`, text)
  await rename(`${args.out}.part`, args.out)

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `puzzles: ${read} read, ${good.length} good, ${kept.length} kept → ${args.out} (${(text.length / 2 ** 20).toFixed(1)} MB, ${seconds} s)`,
  )
  const themes = puzzleThemes(kept)
  console.log(
    `puzzles: ${themes.length} themes; the biggest: ${themes
      .slice(0, 10)
      .map((t) => `${t.theme} ${t.puzzles}`)
      .join(', ')}`,
  )
}

if (import.meta.main) await main()
