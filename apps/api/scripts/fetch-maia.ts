/**
 * Downloads the Maia-3 model (human-like move prediction, CSSLab, AGPL-3.0) as the official
 * Maia platform serves it to browsers, pinned to one commit and checked against git's own hash
 * of the file and its SHA-256. Run it yourself: `bun run maia:fetch`.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { BUNDLED_MAIA as MAIA_MODEL } from '../src/adapters/humanMoves/maia'

const COMMIT = '3e5ef6d86287481cdbf730c1499d5023ae79eb48'
const URL_ = `https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/${COMMIT}/public/maia3/maia3_simplified.onnx`
/** git's object id of the file at that commit: sha1("blob <size>\0" + content). */
const GIT_BLOB = 'f8a21282b2a8e8a44257fba20d4b40f9b9678c38'
const SHA256 = '405bf76c15727dad8728b352c06a8f3c1b80fb2760e8d666b32485c63d75b856'

const gitBlobId = (data: Uint8Array) =>
  createHash('sha1').update(`blob ${data.byteLength}\0`).update(data).digest('hex')
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

function verify(data: Uint8Array): string | undefined {
  if (gitBlobId(data) !== GIT_BLOB) return `git blob ${gitBlobId(data)} ≠ ${GIT_BLOB}`
  if (sha256(data) !== SHA256) return `SHA-256 ${sha256(data)} ≠ ${SHA256}`
  return undefined
}

async function main() {
  const existing = await readFile(MAIA_MODEL).catch(() => undefined)
  if (existing && !verify(existing)) {
    console.log(`Maia-3 model already present (${MAIA_MODEL})`)
    return
  }
  console.log(`Downloading ${URL_}`)
  const res = await fetch(URL_)
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
  const data = new Uint8Array(await res.arrayBuffer())
  const problem = verify(data)
  if (problem) throw new Error(`Checksum mismatch, not saved: ${problem}`)
  await mkdir(dirname(MAIA_MODEL), { recursive: true })
  await writeFile(MAIA_MODEL, data)
  console.log(`Saved ${data.byteLength} bytes, SHA-256 ${sha256(data)}`)
}

if (import.meta.main) await main()
