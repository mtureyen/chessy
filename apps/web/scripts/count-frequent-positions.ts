/**
 * Counts which positions come up in the first moves of real games, for the opening book: samples
 * lichess' database of rated games (CC0, database.lichess.org) and writes the positions that at
 * least MIN_SHARE of games pass through to data/frequent-positions.json (checked in;
 * build-openings.ts adds those above its own threshold to the book).
 *
 *   bun scripts/count-frequent-positions.ts
 *
 * One month is ~29 GB, so the script reads CHUNKS evenly spaced pieces of it with HTTP range
 * requests (~1 GB, about 2.7 million games, of which ~500,000 between 2000+ players). The file is zstd frames of a few MB each: a piece is
 * decoded from the first frame that starts in it. Only games between strong players (see
 * MIN_RATING), without UltraBullet, count.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createZstdDecompress } from 'node:zlib'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { bookKey } from '@chessy/analysis'
import { createGame } from '@chessy/chess'

const MONTH = '2025-09'
const URL_ = `https://database.lichess.org/standard/lichess_db_standard_rated_${MONTH}.pgn.zst`
const CHUNKS = Number(process.env.CHUNKS ?? 30)
const CHUNK_BYTES = 32 * 1024 * 1024
const MAX_PLIES = 16
/** Kept in the data file; the book applies its own, higher threshold. */
const MIN_SHARE = 0.0001
/**
 * Both players at least this strong: what strong players play often is opening theory, while
 * club games also repeat popular mistakes (measured against reference labels: from games of
 * 2000+ players the book found 96 % of book moves at 88 % precision, from 1000+ only 84 %).
 */
const MIN_RATING = Number(process.env.MIN_RATING ?? 2000)
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]

const output = fileURLToPath(new URL('../data/frequent-positions.json', import.meta.url))

interface Header {
  whiteElo: number
  blackElo: number
  timeControl: string
}

/** lichess' speed by estimated duration (initial + 40 × increment, seconds); "-" is correspondence. */
function isUltraBullet(timeControl: string): boolean {
  const [initial, increment = '0'] = timeControl.split('+')
  return timeControl !== '-' && Number(initial) + 40 * Number(increment) < 30
}

/** The first plies of a movetext line, without move numbers, comments and annotations. */
function firstMoves(movetext: string): string[] {
  const moves: string[] = []
  for (const token of movetext.replace(/\{[^}]*\}/g, ' ').split(/\s+/)) {
    if (!token || /^\d+\.+$/.test(token)) continue
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) break
    moves.push(token.replace(/[!?]+$/, ''))
    if (moves.length === MAX_PLIES) break
  }
  return moves
}

async function countChunk(offset: number, counts: Map<string, number>): Promise<number> {
  const res = await fetch(URL_, {
    headers: { Range: `bytes=${offset}-${offset + CHUNK_BYTES - 1}` },
  })
  if (res.status !== 206) throw new Error(`Range request failed: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  let start = 0
  while (start < bytes.length && !ZSTD_MAGIC.every((b, i) => bytes[start + i] === b)) start++
  if (start === bytes.length) throw new Error(`No zstd frame in the chunk at ${offset}`)

  const zstd = createZstdDecompress()
  // The piece ends inside a frame: the decoder stops there, so the last game is dropped below.
  zstd.on('error', () => zstd.push(null))
  Readable.from([bytes.subarray(start)]).pipe(zstd)

  let header: Header | undefined
  let pending: { moves: string[] } | undefined
  let games = 0
  const count = ({ moves }: { moves: string[] }) => {
    const game = createGame()
    for (const san of moves) {
      if (!game.play(san)) return
      const key = bookKey(game.fen())
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    games++
  }
  for await (const line of createInterface({ input: zstd, crlfDelay: Infinity })) {
    if (line.startsWith('[Event ')) header = { whiteElo: 0, blackElo: 0, timeControl: '-' }
    else if (!header)
      continue // before the first complete game of the piece
    else if (line.startsWith('[WhiteElo ')) header.whiteElo = Number(line.slice(11, -2)) || 0
    else if (line.startsWith('[BlackElo ')) header.blackElo = Number(line.slice(11, -2)) || 0
    else if (line.startsWith('[TimeControl ')) header.timeControl = line.slice(14, -2)
    else if (line && !line.startsWith('[')) {
      // A game is counted once the next one starts, so a game cut off by the piece's end isn't.
      if (pending) count(pending)
      pending = undefined
      const { whiteElo, blackElo, timeControl } = header
      if (whiteElo >= MIN_RATING && blackElo >= MIN_RATING && !isUltraBullet(timeControl)) {
        pending = { moves: firstMoves(line) }
      }
      header = undefined
    }
  }
  return games
}

const head = await fetch(URL_, { method: 'HEAD' })
const size = Number(head.headers.get('content-length'))
if (!size) throw new Error(`No size for ${URL_}`)

const counts = new Map<string, number>()
let games = 0
const started = Date.now()
for (let i = 0; i < CHUNKS; i++) {
  const offset = Math.floor(((size - CHUNK_BYTES) * i) / (CHUNKS - 1))
  games += await countChunk(offset, counts)
  console.log(
    `${i + 1}/${CHUNKS}: ${games} games, ${counts.size} positions (${Math.round((Date.now() - started) / 1000)}s)`,
  )
}

const min = Math.max(2, Math.ceil(games * MIN_SHARE))
const positions = Object.fromEntries(
  [...counts].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]),
)
await mkdir(fileURLToPath(new URL('../data/', import.meta.url)), { recursive: true })
await writeFile(
  output,
  `${JSON.stringify({ source: `lichess_db_standard_rated_${MONTH} (${CHUNKS} × ${CHUNK_BYTES / 2 ** 20} MB)`, games, minRating: MIN_RATING, maxPlies: MAX_PLIES, positions })}\n`,
)
console.log(
  `${Object.keys(positions).length} positions in at least ${min} of ${games} games → ${output}`,
)
