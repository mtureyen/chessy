/**
 * Downloads the official native Stockfish build for this platform into apps/api/.engine/
 * (pinned release, verified against GitHub's SHA-256). Run it yourself: `bun run engine:native`.
 * Without it the API reports "no native engine" and reviews run in the browser.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RELEASE = 'sf_19'
const BUILDS: Record<string, { asset: string; sha256: string }> = {
  'darwin-arm64': {
    asset: 'stockfish-macos-universal',
    sha256: 'a1f0e3bcc5a6927a11fe6fc8e54a779754645f3c2bae2cf13420fd1957adaa77',
  },
  'darwin-x64': {
    asset: 'stockfish-macos-universal',
    sha256: 'a1f0e3bcc5a6927a11fe6fc8e54a779754645f3c2bae2cf13420fd1957adaa77',
  },
  'linux-x64': {
    asset: 'stockfish-linux-x86-64-universal',
    sha256: '9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f',
  },
  'linux-arm64': {
    asset: 'stockfish-linux-arm64-universal',
    sha256: 'fe26cfd1d9db4c8af3d21e24d9ff34cacb31c1f940085a7583da11796f2bac01',
  },
}

const platform = `${process.platform}-${process.arch}`
const build = BUILDS[platform]
if (!build) {
  console.error(`No pinned Stockfish build for ${platform}. Install one and set STOCKFISH_PATH.`)
  process.exit(1)
}

const engineDir = fileURLToPath(new URL('../.engine/', import.meta.url))
const stamp = `${RELEASE}/${build.asset}`
if ((await readFile(join(engineDir, 'VERSION'), 'utf8').catch(() => '')) === stamp) {
  console.log(`engine: ${stamp} already installed`)
  process.exit(0)
}

const url = `https://github.com/official-stockfish/Stockfish/releases/download/${RELEASE}/${build.asset}.tar.gz`
console.log(`engine: downloading ${url}`)
const res = await fetch(url)
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
const archive = new Uint8Array(await res.arrayBuffer())
const actual = createHash('sha256').update(archive).digest('hex')
if (actual !== build.sha256)
  throw new Error(`Checksum mismatch: expected ${build.sha256}, got ${actual}`)

const work = await mkdtemp(join(tmpdir(), 'pawnia-stockfish-'))
try {
  await writeFile(join(work, 'stockfish.tar.gz'), archive)
  const entry = `stockfish/${build.asset}`
  const tar = spawnSync('tar', ['-xzf', 'stockfish.tar.gz', entry], { cwd: work, stdio: 'inherit' })
  if (tar.status !== 0) throw new Error('Extracting the archive failed')
  await mkdir(engineDir, { recursive: true })
  await copyFile(join(work, entry), join(engineDir, 'stockfish'))
  await chmod(join(engineDir, 'stockfish'), 0o755)
  await writeFile(join(engineDir, 'VERSION'), stamp)
  console.log(
    `engine: installed ${stamp} → apps/api/.engine/stockfish (GPL-3.0, official-stockfish/Stockfish)`,
  )
} finally {
  await rm(work, { recursive: true, force: true })
}
