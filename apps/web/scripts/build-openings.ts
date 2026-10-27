/**
 * Builds public/openings/book.json from lichess' chess-openings data set (CC0), pinned to a
 * commit and verified by checksum. Used to mark "book" moves and name openings in reviews.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { buildBookData } from '@chessy/analysis'

const COMMIT = 'a6189a30dc273ccb21fc2536a9a2fefd5592a67a'
const FILES: Record<string, string> = {
  'a.tsv': '3282e4c9155289a29224f9a85fba0decb46efa35c2fa5e39662d2ac48fb0f793',
  'b.tsv': '1d5ed134ebbd87915ead5683416e37583bb3e5ae3582b4d8cb5cb4aa7ef4f623',
  'c.tsv': '45e843c7b7e79a0d04d5bda879c9bd23f5a10974488bd8615e4f4c5d0749986f',
  'd.tsv': '1cf4057a8aece94f27bb3f278ad410ee2844831a642364eeceaafa091dbcceda',
  'e.tsv': '48c6f6645b031a5937c8386839debab0e2e48837251687ba1afb6369677f8546',
}

const output = fileURLToPath(new URL('../public/openings/book.json', import.meta.url))
const stamp = `chess-openings@${COMMIT}`

const existing = await readFile(output, 'utf8').catch(() => undefined)
if (existing && (JSON.parse(existing) as { source?: string }).source === stamp) process.exit(0)

const lines: { eco: string; name: string; pgn: string }[] = []
for (const [file, expected] of Object.entries(FILES)) {
  const res = await fetch(
    `https://raw.githubusercontent.com/lichess-org/chess-openings/${COMMIT}/${file}`,
  )
  if (!res.ok) throw new Error(`Download of ${file} failed: HTTP ${res.status}`)
  const text = await res.text()
  const actual = createHash('sha256').update(text).digest('hex')
  if (actual !== expected)
    throw new Error(`Checksum mismatch for ${file}: expected ${expected}, got ${actual}`)
  for (const row of text.trim().split('\n').slice(1)) {
    const [eco = '', name = '', pgn = ''] = row.split('\t')
    lines.push({ eco, name, pgn })
  }
}

const book = buildBookData(lines)
await mkdir(fileURLToPath(new URL('../public/openings/', import.meta.url)), { recursive: true })
await writeFile(output, JSON.stringify({ source: stamp, ...book }))
console.log(
  `openings: ${lines.length} lines → ${Object.keys(book.positions).length} book positions`,
)
