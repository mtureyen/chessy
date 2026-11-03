/**
 * Collects reference move labels for the review benchmark: reviews a chess.com user's recent games
 * on Chessigma (which runs Stockfish in the browser and labels every move much like chess.com does)
 * and saves each move's label. One game at a time with pauses, so it costs Chessigma no more than a
 * person clicking through their games.
 *
 *   bun run bench:references <chess.com username>... [--games 20] [--tabs 1]
 *                            [--out .bench/references.json]
 *                            [--chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
 *
 * Runs a normal Chrome with a temporary profile, driven over the DevTools protocol: Chessigma's
 * engine doesn't run in a browser launched by Playwright itself. Games already in the output file
 * are skipped, so a stopped run can be continued.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium, type Page } from '@playwright/test'
import { importPgn } from '@chessy/chess'
import { ChessComGameSource } from '../src/adapters/sources/chesscom'

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    games: { type: 'string', default: '20' },
    out: {
      type: 'string',
      default: fileURLToPath(new URL('../.bench/references.json', import.meta.url)),
    },
    chrome: {
      type: 'string',
      default: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    port: { type: 'string', default: '9333' },
    /** Chessigma runs one review per browser at a time; more tabs only wait (Nov 2026). */
    tabs: { type: 'string', default: '1' },
  },
})

/** One reviewed game: the label Chessigma gave each move (its icon name, e.g. "very_good"). */
export interface ReferenceGame {
  url: string
  pgn: string
  ratings: { white?: number; black?: number }
  labels: { ply: number; uci: string; label: string }[]
}

const REVIEW_TIMEOUT_MS = 240_000
const PAUSE_BETWEEN_GAMES_MS = 5_000

async function main() {
  if (positionals.length === 0) {
    throw new Error('usage: collect-references <chess.com username>... [--games 20]')
  }
  const done: ReferenceGame[] = existsSync(args.out)
    ? JSON.parse(readFileSync(args.out, 'utf8'))
    : []
  const source = new ChessComGameSource({
    userAgent: 'Chessy (+https://github.com/mtureyen/chessy)',
  })
  // --games per user.
  const games = []
  for (const username of positionals) {
    try {
      const recent = await source.recentGames(username, { max: Number(args.games) })
      games.push(...recent.filter((game) => !done.some((d) => d.url === game.url)))
    } catch (error) {
      console.log(`${username}: skipped (${error instanceof Error ? error.message : error})`)
    }
  }
  console.log(`${games.length} games to review (${done.length} already collected)`)
  if (games.length === 0) return

  const profile = mkdtempSync(join(tmpdir(), 'chessy-references-'))
  const chrome = spawn(args.chrome, [
    `--remote-debugging-port=${args.port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    // Reviews run in tabs that aren't in front: keep Chrome from slowing those down.
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    'about:blank',
  ])
  try {
    const browser = await connect(Number(args.port))
    const context = browser.contexts()[0]!
    // A few tabs review at once; each takes the next game when it is done.
    const pages = [context.pages()[0] ?? (await context.newPage())]
    while (pages.length < Number(args.tabs)) pages.push(await context.newPage())
    const queue = [...games]
    let finished = 0
    const worker = async (page: Page) => {
      for (let game = queue.shift(); game; game = queue.shift()) {
        const started = Date.now()
        const { game: replay } = importPgn(game.pgn)
        replay.toStart()
        const plies = replay.line().length
        const progress = `${++finished}/${games.length} ${game.url}`
        let labels: ReferenceGame['labels']
        try {
          labels = await review(page, game.url, plies)
        } catch (error) {
          console.log(
            `${progress}: failed (${error instanceof Error ? error.message.split('\n')[0] : error})`,
          )
          continue
        }
        if (labels.length !== plies) {
          console.log(`${progress}: ${labels.length} of ${plies} moves labelled, skipped`)
        } else {
          done.push({
            url: game.url,
            pgn: game.pgn,
            ratings: { white: game.white.rating, black: game.black.rating },
            labels,
          })
          writeFileSync(args.out, JSON.stringify(done, null, 1))
          console.log(`${progress}: ${plies} moves (${Math.round((Date.now() - started) / 1000)}s)`)
        }
        await page.waitForTimeout(PAUSE_BETWEEN_GAMES_MS)
      }
    }
    await Promise.all(pages.map(worker))
    await browser.close().catch(() => undefined)
  } finally {
    chrome.kill()
    rmSync(profile, { recursive: true, force: true })
  }
}

async function connect(port: number) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error(`Chrome did not open its DevTools port ${port}`)
}

/**
 * Opens the game's Chessigma review, waits until every move has its label and reads them. The
 * review only completes with the report open and its classifications shown, so the script opens
 * them (the Report tab, then "Show all classifications") whenever nothing has moved for a while.
 */
async function review(
  page: Page,
  gameUrl: string,
  plies: number,
): Promise<ReferenceGame['labels']> {
  const path = new URL(gameUrl).pathname // /game/live/<n> or /game/daily/<n>
  await page.goto(`https://www.chessigma.com/import/chesscom${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await page.getByRole('button', { name: 'Start review' }).click({ timeout: 60_000 })
  const started = Date.now()
  let lastNudge = 0
  for (;;) {
    // Browser code is passed as text: this project has no DOM types, and Playwright runs it in
    // the page either way.
    const labels = (await page.evaluate(READ_LABELS)) as ReferenceGame['labels']
    if (labels.length === plies) return labels
    if (Date.now() - started > REVIEW_TIMEOUT_MS) return labels
    if (Date.now() - lastNudge > 10_000) {
      lastNudge = Date.now()
      await clickIfThere(page.getByRole('button', { name: 'Report', exact: true }))
      await clickIfThere(page.getByRole('button', { name: 'Show all classifications' }))
    }
    await page.waitForTimeout(2000)
  }
}

async function clickIfThere(locator: ReturnType<Page['getByRole']>) {
  const target = locator.first()
  if (await target.isVisible().catch(() => false)) await target.click().catch(() => undefined)
}

/** Each move button's data-node-id is "root-e2e4-c7c5-…", the moves (UCI) up to it. */
const READ_LABELS = `[...document.querySelectorAll('button.v2StripMove')].flatMap((button) => {
  const path = (button.dataset.nodeId || '').split('-').slice(1)
  const icon = button.querySelector('.v2StripSeal img')
  const label = icon && (icon.src.match(/\\/moves\\/([a-z_]+)\\.png/) || [])[1]
  const uci = path[path.length - 1]
  return label && uci ? [{ ply: path.length, uci, label }] : []
})`

await main()
process.exit(0)
