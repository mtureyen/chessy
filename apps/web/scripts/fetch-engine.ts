/**
 * Downloads the pinned Stockfish build into public/engine/ (D-007: lite, single-threaded).
 * Skips files that are already present with the right checksum; fails on any mismatch.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const VERSION = '19.0.1'
const BASE_URL = `https://github.com/nmrugg/stockfish.js/releases/download/v${VERSION}`
const FILES: Record<string, string> = {
  'stockfish-19-lite-single.js': 'ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a',
  'stockfish-19-lite-single.wasm':
    'ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de',
}

const targetDir = fileURLToPath(new URL('../public/engine/', import.meta.url))
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

async function ensure(name: string, expected: string): Promise<'cached' | 'downloaded'> {
  const path = targetDir + name
  const existing = await readFile(path).catch(() => undefined)
  if (existing && sha256(existing) === expected) return 'cached'

  const res = await fetch(`${BASE_URL}/${name}`)
  if (!res.ok) throw new Error(`Download of ${name} failed: HTTP ${res.status}`)
  const data = new Uint8Array(await res.arrayBuffer())
  const actual = sha256(data)
  if (actual !== expected)
    throw new Error(`Checksum mismatch for ${name}: expected ${expected}, got ${actual}`)
  await writeFile(path, data)
  return 'downloaded'
}

await mkdir(targetDir, { recursive: true })
for (const [name, hash] of Object.entries(FILES)) {
  const result = await ensure(name, hash)
  if (result === 'downloaded') console.log(`engine: downloaded ${name} (Stockfish.js ${VERSION})`)
}
