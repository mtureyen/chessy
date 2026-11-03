/**
 * Builds the extension into apps/extension/dist: bundle the scripts and copy the manifest and
 * options page. Load dist/ in Chrome via chrome://extensions → Developer mode → Load unpacked.
 */
import { cp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const dist = fileURLToPath(new URL('dist/', root))

await rm(dist, { recursive: true, force: true })
const result = await Bun.build({
  entrypoints: ['content.ts', 'options.ts'].map((f) => fileURLToPath(new URL(`src/${f}`, root))),
  outdir: dist,
  target: 'browser',
  format: 'esm',
  minify: false,
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
await cp(fileURLToPath(new URL('static/', root)), dist, { recursive: true })
console.log(`Built the extension into ${dist}`)
