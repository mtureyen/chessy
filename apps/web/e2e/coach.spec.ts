import { expect, test, type Page } from '@playwright/test'

const GAME = '[White "8sly"]\n[Black "rival"]\n[WhiteElo "790"]\n\n1. e4 e5 2. Nf3 Nc6 *'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
/** The coach's green, as the board draws it. */
const COACH_GREEN = '#5f9e2f'

const sse = (events: unknown[]) =>
  events
    .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('')

/** A coach that is ready, answers from a script and keeps what it was asked; nothing leaves the machine. */
async function scriptedCoach(page: Page) {
  const asked: { question: string; context: Record<string, unknown>; agent: string }[] = []
  await page.route('**/api/v1/coach', (route) =>
    route.fulfill({
      json: {
        agents: [
          { id: 'claude-api', label: 'Claude (test)', available: true },
          { id: 'ollama', label: 'Ollama', available: false, reason: 'not running' },
        ],
      },
    }),
  )
  await page.route('**/api/v1/coach/messages', (route) => {
    asked.push(route.request().postDataJSON())
    return route.fulfill({
      headers: { 'Content-Type': 'text/event-stream' },
      body:
        ': keep-alive\n\n' +
        sse([
          { type: 'tool', name: 'evaluate_position', input: { fen: AFTER_E4 } },
          { type: 'tool_result', name: 'evaluate_position', ok: true },
          { type: 'text', delta: 'After **1. e4** White ' },
          { type: 'text', delta: 'controls the centre.\n\n- d4 is next' },
          {
            type: 'board',
            drawing: {
              arrows: [{ from: 'd2', to: 'd4', color: 'green' }],
              squares: [{ square: 'e4', color: 'yellow' }],
              fen: AFTER_E4,
            },
          },
          { type: 'done', usage: { inputTokens: 1200, outputTokens: 80 } },
        ]),
    })
  })
  return asked
}

test('ask the coach about the game: streamed answer, tools, and its drawing on the board', async ({
  page,
}) => {
  const asked = await scriptedCoach(page)
  // The user is 8sly on chess.com, so their rating in the game goes with the question.
  await page.route('**/api/v1/profile', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          json: {
            profile: {
              id: 'p1',
              displayName: '8sly',
              accounts: [{ source: 'chesscom', username: '8sly' }],
              createdAt: '2026-11-05T00:00:00.000Z',
              updatedAt: '2026-11-05T00:00:00.000Z',
            },
          },
        })
      : route.continue(),
  )
  await page.goto(`/analysis?${new URLSearchParams({ pgn: GAME })}`)
  await page.waitForSelector('cg-board')
  await page.getByRole('tab', { name: 'Coach' }).click()

  await expect(page.getByRole('combobox', { name: 'Coach' })).toHaveValue('claude-api')
  await page.getByRole('textbox', { name: 'Your question' }).fill('What is going on?')
  await page.getByRole('button', { name: 'Ask' }).click()

  const reply = page.locator('.coach-reply')
  await expect(reply.locator('strong')).toHaveText('1. e4')
  await expect(reply).toContainText('controls the centre.')
  await expect(reply.locator('li')).toHaveText(['engine', 'd4 is next'])
  await expect(reply).toContainText('1.2k in / 80 out tokens')

  // The question went with the position, the game and the user's rating in it.
  expect(asked).toHaveLength(1)
  expect(asked[0]).toMatchObject({
    agent: 'claude-api',
    question: 'What is going on?',
    context: { fen: expect.stringMatching(/^r1bqkbnr\/pppp1ppp\/2n5/), rating: 790 },
  })
  expect(asked[0]!.context.pgn).toContain('2. Nf3 Nc6')

  // The drawing is on a position of the game: the board went there and shows it.
  const coachArrow = page.locator(`svg.cg-shapes line[stroke="${COACH_GREEN}"]`)
  await expect(coachArrow).toHaveCount(1)
  await page.getByRole('tab', { name: 'Moves' }).click()
  await expect(page.locator('.move-tree .move-current')).toHaveText('e4')
  // Elsewhere in the game it is gone; the button brings it back.
  await page.locator('.move-tree [data-san="Nc6"]').click()
  await expect(coachArrow).toHaveCount(0)
  await page.getByRole('tab', { name: 'Coach' }).click()
  await page.getByRole('button', { name: 'Show on the board' }).click()
  await expect(coachArrow).toHaveCount(1)
  await page.getByRole('tab', { name: 'Moves' }).click()
  await expect(page.locator('.move-tree .move-current')).toHaveText('e4')

  // The conversation stays while switching tabs; a new chat starts over.
  await page.getByRole('tab', { name: 'Coach' }).click()
  await expect(reply).toContainText('controls the centre.')
  await page.getByRole('button', { name: 'New chat' }).click()
  await expect(reply).toHaveCount(0)
})

test('without a ready coach, the panel points to the settings', async ({ page }) => {
  await page.route('**/api/v1/coach', (route) =>
    route.fulfill({
      json: {
        agents: [{ id: 'ollama', label: 'Ollama', available: false, reason: 'not running' }],
      },
    }),
  )
  await page.goto('/analysis')
  await page.getByRole('tab', { name: 'Coach' }).click()
  await expect(page.getByText('No coach is ready to answer.')).toBeVisible()
  await expect(page.getByText('Ollama: not running')).toBeVisible()
  await page.getByRole('link', { name: 'Set one up in Settings → Coach' }).click()
  await expect(page).toHaveURL(/\/settings\?tab=coach$/)
})
