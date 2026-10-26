import { expect, test, type Page } from '@playwright/test'
import type { AnalysisHandle, AnalysisRequest, EngineProvider } from '@chessy/analysis'

/**
 * Runs real Stockfish (WASM, Web Worker) through our actual browser adapter + UciEngine.
 * The adapter module is loaded through the Vite dev server, exactly as the app loads it.
 */
async function analyzeInBrowser(
  page: Page,
  requests: AnalysisRequest[],
  options: { overlapMs?: number } = {},
) {
  return page.evaluate(
    async ({ requests, overlapMs }) => {
      const modulePath = '/src/adapters/engine/stockfish.ts'
      const { createBrowserEngine } = (await import(/* @vite-ignore */ modulePath)) as {
        createBrowserEngine: () => EngineProvider
      }
      const engine = createBrowserEngine()
      const info = await engine.init()
      const handles: AnalysisHandle[] = []
      for (const request of requests) {
        handles.push(engine.analyze(request))
        if (overlapMs) await new Promise((r) => setTimeout(r, overlapMs))
      }
      const results = await Promise.all(handles.map((h) => h.result))
      engine.dispose()
      return { info, results }
    },
    { requests, overlapMs: options.overlapMs ?? 0 },
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('loads Stockfish and analyses the start position with 3 lines', async ({ page }) => {
  const { info, results } = await analyzeInBrowser(page, [
    { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', depth: 12, multiPv: 3 },
  ])
  expect(info.name).toMatch(/Stockfish/)
  const [result] = results
  expect(result).toMatchObject({ end: 'limit', depth: 12 })
  expect(result!.lines.map((l) => l.rank)).toEqual([1, 2, 3])
  expect(new Set(result!.lines.map((l) => l.pv[0])).size).toBe(3)
  const best = result!.lines[0]!.score
  expect(best.type === 'cp' && Math.abs(best.value) < 100).toBe(true)
  expect(result!.bestMove).toBe(result!.lines[0]!.pv[0])
})

test('finds mate in one and reports it as a mate for White', async ({ page }) => {
  const { results } = await analyzeInBrowser(page, [
    { fen: '7k/6pp/8/8/8/8/8/R5K1 w - - 0 1', depth: 10 },
  ])
  expect(results[0]).toMatchObject({
    bestMove: 'a1a8',
    lines: [{ score: { type: 'mate', winner: 'white', moves: 1 } }],
  })
})

test('scores from White’s point of view when Black is to move', async ({ page }) => {
  // Black has lost the queen and is to move: clearly better for White.
  const { results } = await analyzeInBrowser(page, [
    { fen: 'rnb1kbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3', depth: 10 },
  ])
  const score = results[0]!.lines[0]!.score
  expect(score.type === 'cp' ? score.value : 0).toBeGreaterThan(500)
})

test('a new analysis supersedes a running one', async ({ page }) => {
  const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
  const { results } = await analyzeInBrowser(
    page,
    [
      { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
      { fen: afterE4, depth: 10 },
    ],
    { overlapMs: 300 },
  )
  expect(results[0]).toMatchObject({ end: 'superseded' })
  expect(results[1]).toMatchObject({ end: 'limit', fen: afterE4, depth: 10 })
})

test('handles a checkmated position without a best move', async ({ page }) => {
  const { results } = await analyzeInBrowser(page, [
    { fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', depth: 5 },
  ])
  expect(results[0]).toMatchObject({ end: 'limit', lines: [] })
  expect(results[0]!.bestMove).toBeUndefined()
})
