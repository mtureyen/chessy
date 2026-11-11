/**
 * Builds data/opening-library.json, the opening library: the start set's named lines (lichess'
 * chess-openings, CC0), what real games played from their positions per rating band (a sample of
 * lichess' database of rated games, CC0, database.lichess.org), tags, and traps the engine
 * confirms. Checked in; run again to refresh:
 *
 *   bun scripts/build-library.ts            (CHUNKS=4 for a quick try)
 *
 * The sample is read like apps/web/scripts/count-frequent-positions.ts: evenly spaced pieces of
 * one month's file by HTTP range, each decoded from its first zstd frame.
 */
import {
  bookKey,
  entryLines,
  LIBRARY_PLIES,
  LibraryCounter,
  libraryKeys,
  openingNumbers,
  openingTags,
  sanMoves,
  START_SET,
  TRAP_LOSS,
  trapCandidates,
  trapInOpening,
  toSanLine,
  formatSanLine,
  whiteWinChance,
  type BookLine,
  type PositionCounts,
} from '@pawnia/analysis'
import { createGame } from '@pawnia/chess'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createZstdDecompress } from 'node:zlib'
import {
  createNativeEngineService,
  defaultPoolSize,
  resolveStockfishPath,
} from '../src/adapters/engine/native'

const COMMIT = 'a6189a30dc273ccb21fc2536a9a2fefd5592a67a'
const FILES: Record<string, string> = {
  'a.tsv': '3282e4c9155289a29224f9a85fba0decb46efa35c2fa5e39662d2ac48fb0f793',
  'b.tsv': '1d5ed134ebbd87915ead5683416e37583bb3e5ae3582b4d8cb5cb4aa7ef4f623',
  'c.tsv': '45e843c7b7e79a0d04d5bda879c9bd23f5a10974488bd8615e4f4c5d0749986f',
  'd.tsv': '1cf4057a8aece94f27bb3f278ad410ee2844831a642364eeceaafa091dbcceda',
  'e.tsv': '48c6f6645b031a5937c8386839debab0e2e48837251687ba1afb6369677f8546',
}
const MONTH = '2025-09'
const SAMPLE = `https://database.lichess.org/standard/lichess_db_standard_rated_${MONTH}.pgn.zst`
const CHUNKS = Number(process.env.CHUNKS ?? 30)
const CHUNK_BYTES = 32 * 1024 * 1024
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
/** Engine budget per trap position (both the position and the one after the bait). */
const TRAP_NODES = 2_000_000
/** A move is kept in the file when it has at least this share of a position's games … */
const MIN_MOVE_SHARE = 0.01
/** … or is among this many most played. */
const TOP_MOVES = 6
const PUNISH_PLIES = 5

const output = fileURLToPath(new URL('../data/opening-library.json', import.meta.url))

// 1. The named lines.
const book: BookLine[] = []
for (const [file, expected] of Object.entries(FILES)) {
  const res = await fetch(
    `https://raw.githubusercontent.com/lichess-org/chess-openings/${COMMIT}/${file}`,
  )
  if (!res.ok) throw new Error(`Download of ${file} failed: HTTP ${res.status}`)
  const text = await res.text()
  const actual = createHash('sha256').update(text).digest('hex')
  if (actual !== expected) throw new Error(`Checksum mismatch for ${file}: ${actual}`)
  for (const row of text.trim().split('\n').slice(1)) {
    const [eco = '', name = '', pgn = ''] = row.split('\t')
    book.push({ eco, name, moves: sanMoves(pgn).join(' ') })
  }
}
const entries = START_SET.map((entry) => ({ ...entry, lines: entryLines(entry, book) }))
for (const entry of entries) console.log(`${entry.id}: ${entry.lines.length} named lines`)
const keys = libraryKeys(entries)
console.log(`${keys.size} library positions`)

// 2. Real games, per band.
function isUltraBullet(timeControl: string): boolean {
  const [initial, increment = '0'] = timeControl.split('+')
  return timeControl !== '-' && Number(initial) + 40 * Number(increment) < 30
}

function firstMoves(movetext: string): string[] {
  const moves: string[] = []
  for (const token of movetext.replace(/\{[^}]*\}/g, ' ').split(/\s+/)) {
    if (!token || /^\d+\.+$/.test(token)) continue
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) break
    moves.push(token.replace(/[!?]+$/, ''))
    if (moves.length === LIBRARY_PLIES) break
  }
  return moves
}

/** Half-moves counted past where a game leaves the library's lines: many traps are there. */
const BEYOND = 2
const counter = new LibraryCounter(keys, { beyond: BEYOND })

async function countChunk(offset: number): Promise<void> {
  const res = await fetch(SAMPLE, {
    headers: { Range: `bytes=${offset}-${offset + CHUNK_BYTES - 1}` },
  })
  if (res.status !== 206) throw new Error(`Range request failed: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  let start = 0
  while (start < bytes.length && !ZSTD_MAGIC.every((b, i) => bytes[start + i] === b)) start++
  if (start === bytes.length) throw new Error(`No zstd frame in the chunk at ${offset}`)
  const zstd = createZstdDecompress()
  zstd.on('error', () => zstd.push(null))
  Readable.from([bytes.subarray(start)]).pipe(zstd)

  let header: { white: number; black: number; result: string; timeControl: string } | undefined
  let pending: { moves: string[]; result: string; white: number; black: number } | undefined
  for await (const line of createInterface({ input: zstd, crlfDelay: Infinity })) {
    if (line.startsWith('[Event ')) header = { white: 0, black: 0, result: '*', timeControl: '-' }
    else if (!header) continue
    else if (line.startsWith('[WhiteElo ')) header.white = Number(line.slice(11, -2)) || 0
    else if (line.startsWith('[BlackElo ')) header.black = Number(line.slice(11, -2)) || 0
    else if (line.startsWith('[Result ')) header.result = line.slice(9, -2)
    else if (line.startsWith('[TimeControl ')) header.timeControl = line.slice(14, -2)
    else if (line && !line.startsWith('[')) {
      // A game counts once the next one starts: one cut off by the piece's end doesn't.
      if (pending) counter.add(pending.moves, pending.result, pending.white, pending.black)
      pending = undefined
      if (header.white > 0 && header.black > 0 && !isUltraBullet(header.timeControl)) {
        pending = {
          moves: firstMoves(line),
          result: header.result,
          white: header.white,
          black: header.black,
        }
      }
      header = undefined
    }
  }
}

/** LIBRARY_COUNTS=<file>: keeps the counts there, and reads them back instead of sampling again. */
const cache = process.env.LIBRARY_COUNTS
const cached = cache ? await readFile(cache, 'utf8').catch(() => undefined) : undefined
if (cached) {
  const { games, positions } = JSON.parse(cached) as {
    games: typeof counter.games
    positions: Record<string, PositionCounts>
  }
  Object.assign(counter.games, games)
  for (const [key, counts] of Object.entries(positions)) counter.positions.set(key, counts)
  console.log(`counts read from ${cache}`)
}
const head = cached ? undefined : await fetch(SAMPLE, { method: 'HEAD' })
const size = Number(head?.headers.get('content-length') ?? 0)
if (!cached && !size) throw new Error(`No size for ${SAMPLE}`)
const started = Date.now()
for (let i = 0; i < (cached ? 0 : CHUNKS); i++) {
  const offset = Math.floor(((size - CHUNK_BYTES) * i) / Math.max(1, CHUNKS - 1))
  await countChunk(offset)
  // Lossy counting: past the library's lines, a position seen fewer times than chunks read is
  // rare enough to drop (it stays undercounted by at most that much).
  counter.prune(i + 1)
  const total = Object.values(counter.games).reduce((a, b) => a + b, 0)
  console.log(`${i + 1}/${CHUNKS}: ${total} games (${Math.round((Date.now() - started) / 1000)}s)`)
}

if (cache && !cached) {
  await writeFile(
    cache,
    JSON.stringify({ games: counter.games, positions: Object.fromEntries(counter.positions) }),
  )
}

// 3. Traps the engine confirms.
const candidates = trapCandidates(counter.positions)
console.log(`${candidates.length} trap candidates; asking the engine`)
const engine = createNativeEngineService({
  path: resolveStockfishPath(process.env.STOCKFISH_PATH),
  poolSize: defaultPoolSize(),
  hashMb: 256,
})
const after = candidates.map((c) => {
  const game = createGame(c.fen)
  const node = game.play(c.bait)!
  return node.fen
})
const evals = await engine.evaluate({
  fens: [...candidates.map((c) => c.fen), ...after],
  nodes: TRAP_NODES,
  multiPv: 1,
})
const victimWin = (index: number, victim: 'white' | 'black') => {
  const score = evals[index]?.lines[0]?.score
  if (!score) return undefined
  const white = whiteWinChance(score)
  return victim === 'white' ? white : 100 - white
}
const traps = candidates.flatMap((c, i) => {
  const victim = c.trapper === 'white' ? 'black' : 'white'
  const before = victimWin(i, victim)
  const afterBait = victimWin(candidates.length + i, victim)
  if (before === undefined || afterBait === undefined) return []
  const loss = Math.round(before - afterBait)
  if (loss < TRAP_LOSS) return []
  const bestUci = evals[i]?.lines[0]?.pv[0]
  const best = bestUci ? createGame(c.fen).play(bestUci)?.move?.san : undefined
  const punish = formatSanLine(
    toSanLine(after[i]!, evals[candidates.length + i]?.lines[0]?.pv ?? [], PUNISH_PLIES),
  )
  return [{ ...c, loss, ...(best && { best }), punish }]
})
console.log(`${traps.length} traps confirmed`)

// 4. The file.
const kept = new Map<string, PositionCounts>()
for (const [key, counts] of counter.positions) {
  if (!counter.isLibrary(key)) continue
  const sums = Object.entries(counts).map(
    ([san, c]) => [san, c.reduce((a, b) => a + b, 0)] as const,
  )
  const all = sums.reduce((sum, [, n]) => sum + n, 0)
  const top = new Set(
    [...sums]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_MOVES)
      .map(([san]) => san),
  )
  const moves = Object.fromEntries(
    Object.entries(counts).filter(
      ([san]) => top.has(san) || sums.find(([s]) => s === san)![1] >= all * MIN_MOVE_SHARE,
    ),
  )
  kept.set(key, moves)
}
const mainKey = (main: string) => {
  const game = createGame()
  for (const san of main.split(' ')) game.play(san)
  return bookKey(game.fen())
}
const library = {
  version: 1,
  source: `chess-openings@${COMMIT} + lichess_db_standard_rated_${MONTH} (${CHUNKS} × ${CHUNK_BYTES / 2 ** 20} MB)`,
  games: counter.games,
  openings: entries.map((entry) => {
    const main = kept.get(mainKey(entry.main))
    return {
      ...entry,
      lines: entry.lines.map(({ eco, name, moves }) => ({ eco, name, moves })),
      numbers: openingNumbers(entry.side, main, counter.games),
      tags: openingTags(main, entry.side, counter.games),
    }
  }),
  // Each trap with the openings it belongs to, in each one's own move order.
  traps: traps.map(({ fen: _fen, moves, ...trap }) => ({
    ...trap,
    moves: moves.join(' '),
    openings: entries.flatMap((entry) => {
      const path = trapInOpening(moves, entry)
      return path ? [{ id: entry.id, moves: path.join(' ') }] : []
    }),
  })),
  positions: Object.fromEntries(kept),
}
await mkdir(fileURLToPath(new URL('../data/', import.meta.url)), { recursive: true })
await writeFile(output, `${JSON.stringify(library)}\n`)
console.log(
  `${library.openings.length} openings, ${kept.size} positions, ${traps.length} traps → ${output}`,
)
process.exit(0)
