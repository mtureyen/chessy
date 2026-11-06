import { expect, test, type Page } from '@playwright/test'
import { boardDriver } from './board'

/** The coach's green, as the board draws it. */
const COACH_GREEN = '#5f9e2f'
const COMMENT = 'That weakened the squares around your king.'
/** Quiet moves out of the opening book, then one the scripted engine calls a blunder. */
const OPENING: [string, string][] = [
  ['a2', 'a3'],
  ['h2', 'h3'],
]
const BLUNDER: [string, string] = ['g2', 'g3']

const sse = (events: unknown[]) =>
  events
    .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('')

/** An engine on the server that likes every position, except after White's third move and on. */
async function scriptedEngine(page: Page) {
  const evaluated: string[] = []
  await page.route('**/api/v1/engine', (route) =>
    route.fulfill({ json: { available: true, name: 'FakeFish 9', parallelism: 4 } }),
  )
  await page.route('**/api/v1/engine/evaluations', async (route) => {
    const { fens } = route.request().postDataJSON() as { fens: string[] }
    evaluated.push(...fens)
    const lines = fens.map((fen, index) => {
      const [, turn, , , , moveNumber] = fen.split(' ')
      const value = turn === 'b' && Number(moveNumber) >= 3 ? -900 : 0
      return JSON.stringify({
        type: 'evaluated',
        index,
        eval: {
          depth: 12,
          lines: [{ rank: 1, depth: 12, score: { type: 'cp', value }, pv: ['e2e4', 'e7e5'] }],
        },
      })
    })
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body: [...lines, JSON.stringify({ type: 'done' })].join('\n') + '\n',
    })
  })
  return evaluated
}

/** A coach that is ready and keeps what it was asked; nothing leaves the machine. */
async function scriptedCoach(page: Page) {
  const comments: Record<string, unknown>[] = []
  const questions: { question: string; context: Record<string, string> }[] = []
  await page.route('**/api/v1/coach', (route) =>
    route.fulfill({
      json: { agents: [{ id: 'claude-api', label: 'Claude (test)', available: true }] },
    }),
  )
  await page.route('**/api/v1/coach/comments', (route) => {
    comments.push(route.request().postDataJSON())
    return route.fulfill({ json: { text: COMMENT } })
  })
  await page.route('**/api/v1/coach/messages', (route) => {
    const asked = route.request().postDataJSON() as (typeof questions)[number]
    questions.push(asked)
    return route.fulfill({
      headers: { 'Content-Type': 'text/event-stream' },
      body: sse([
        { type: 'text', delta: 'The game turned on g3.' },
        {
          type: 'board',
          drawing: {
            arrows: [{ from: 'g2', to: 'g3', color: 'green' }],
            squares: [],
            fen: 'rnbqkbnr/pppppppp/8/8/8/P7/1PPPPPPP/RNBQKBNR b KQkq - 0 1',
          },
        },
        { type: 'done', usage: { inputTokens: 100, outputTokens: 10 } },
      ]),
    })
  })
  return { comments, questions }
}

async function startGame(page: Page, { comments = false } = {}) {
  await page.goto('/bot')
  const group = (name: string) => page.getByRole('group', { name })
  await group('Level').getByRole('button', { name: /^1\b/ }).click()
  await group('You play').getByRole('button', { name: 'White', exact: true }).click()
  if (comments) await page.getByRole('switch', { name: 'Coach comments' }).check()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  return boardDriver(page)
}

const moves = (page: Page) => page.locator('.move-tree [data-san]')

/** Plays the user's moves, each time until the bot has answered. */
async function playOut(
  page: Page,
  board: Awaited<ReturnType<typeof boardDriver>>,
  list: typeof OPENING,
) {
  for (const move of list) {
    const before = await moves(page).count()
    await board.play(move)
    await expect(moves(page)).toHaveCount(before + 2, { timeout: 15_000 })
  }
}

test('the coach stays quiet by default: no comment, no engine work, chat closed', async ({
  page,
}) => {
  const evaluated = await scriptedEngine(page)
  const { comments } = await scriptedCoach(page)
  const board = await startGame(page)

  const coach = page.getByRole('region', { name: 'Coach' })
  await expect(coach).toContainText('when the game is over')
  await expect(page.getByRole('switch', { name: 'Coach comments' })).not.toBeChecked()
  await playOut(page, board, [...OPENING, BLUNDER])

  await expect(page.getByRole('list', { name: 'Coach comments' })).toHaveCount(0)
  expect(comments).toEqual([])
  expect(evaluated).toEqual([])
  await expect(page.getByRole('textbox', { name: 'Your question' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Coach' })).toHaveCount(0)
})

test('with the switch on, a notable move gets a comment made of facts alone', async ({ page }) => {
  await scriptedEngine(page)
  const { comments } = await scriptedCoach(page)
  const board = await startGame(page, { comments: true })

  await playOut(page, board, OPENING)
  expect(comments).toEqual([]) // quiet moves are skipped
  await playOut(page, board, [BLUNDER])

  const list = page.getByRole('list', { name: 'Coach comments' })
  await expect(list).toContainText(COMMENT)
  await expect(list).toContainText('3. g3')
  await expect(list.getByRole('img', { name: 'Blunder' })).toBeVisible()
  expect(comments).toHaveLength(1)
  const [comment] = comments
  expect(comment).toMatchObject({
    agent: 'claude-api',
    color: 'white',
    moveNumber: 3,
    san: 'g3',
    verdict: 'blunder',
    winBefore: 50,
  })
  // The engine preferred e2e4 here: neither that nor anything else of its lines goes along.
  expect(Object.keys(comment!).sort()).toEqual(
    ['agent', 'color', 'fen', 'moveNumber', 'san', 'verdict', 'winAfter', 'winBefore'].sort(),
  )
  expect(JSON.stringify(comment)).not.toMatch(/e2e4|e7e5/)

  // The chat stays closed while the game runs.
  await expect(page.getByRole('textbox', { name: 'Your question' })).toHaveCount(0)

  // The choice is remembered in this browser.
  await page.goto('/bot')
  await expect(page.getByRole('switch', { name: 'Coach comments' })).toBeChecked()
})

test('one comment at a time: a move played meanwhile is skipped', async ({ page }) => {
  await scriptedEngine(page)
  await scriptedCoach(page)
  let requests = 0
  let release = () => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/v1/coach/comments', async (route) => {
    requests++
    await released
    await route.fulfill({ json: { text: COMMENT } })
  })
  const board = await startGame(page, { comments: true })
  await playOut(page, board, [...OPENING, BLUNDER])
  await expect.poll(() => requests).toBe(1)

  // The bot keeps playing while the comment is written; this blunder goes without one.
  await playOut(page, board, [['a3', 'a4']])
  release()
  await expect(page.getByRole('list', { name: 'Coach comments' }).locator('li')).toHaveCount(1)
  expect(requests).toBe(1)
})

test('a failed comment is dropped quietly and the game goes on', async ({ page }) => {
  await scriptedEngine(page)
  await scriptedCoach(page)
  let failed = false
  await page.route('**/api/v1/coach/comments', (route) => {
    failed = true
    return route.fulfill({
      status: 502,
      contentType: 'application/problem+json',
      body: JSON.stringify({ title: 'No comment', status: 502 }),
    })
  })
  const board = await startGame(page, { comments: true })
  await playOut(page, board, [...OPENING, BLUNDER])
  await expect.poll(() => failed).toBe(true)

  await expect(page.getByRole('list', { name: 'Coach comments' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await playOut(page, board, [['a3', 'a4']])
})

test('a takeback takes its comment along', async ({ page }) => {
  await scriptedEngine(page)
  await scriptedCoach(page)
  const board = await startGame(page, { comments: true })
  await playOut(page, board, [...OPENING, BLUNDER])
  const list = page.getByRole('list', { name: 'Coach comments' })
  await expect(list).toContainText(COMMENT)

  await page.getByRole('button', { name: 'Takeback' }).click()
  await expect(moves(page)).toHaveCount(4)
  await expect(list).toHaveCount(0)
})

test('after the game the chat opens with that game and draws on the board', async ({ page }) => {
  await scriptedEngine(page)
  const { questions } = await scriptedCoach(page)
  const board = await startGame(page)
  await playOut(page, board, OPENING)
  await page.getByRole('button', { name: 'Resign' }).click()
  await expect(page.getByText('Saved to your games.')).toBeVisible()

  await page.getByRole('tab', { name: 'Coach' }).click()
  await page.getByRole('textbox', { name: 'Your question' }).fill('Where did it go wrong?')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(page.locator('.coach-reply')).toContainText('The game turned on g3.')

  expect(questions).toHaveLength(1)
  expect(questions[0]!.context.fen).toMatch(/ w /)
  expect(questions[0]!.context.pgn).toContain('1. a3')
  expect(questions[0]!.context.pgn).toContain('[White "You"]')
  expect(questions[0]!.context.pgn).toContain('[Result "0-1"]')

  // The drawing is on a position of the game: the board went there and shows it.
  const coachArrow = page.locator(`svg.cg-shapes line[stroke="${COACH_GREEN}"]`)
  await expect(coachArrow).toHaveCount(1)
  await page.getByRole('tab', { name: 'Moves' }).click()
  await expect(page.locator('.move-tree .move-current')).toHaveText('a3')
})

test('with no coach ready, the switch says so instead of staying silent', async ({ page }) => {
  await page.route('**/api/v1/coach', (route) =>
    route.fulfill({
      json: {
        agents: [{ id: 'ollama', label: 'Ollama', available: false, reason: 'not running' }],
      },
    }),
  )
  await startGame(page, { comments: true })
  await expect(page.getByText('No coach is ready to comment.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Set one up' })).toHaveAttribute(
    'href',
    '/settings?tab=coach',
  )
})
