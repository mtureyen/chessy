import { expect, test } from '@playwright/test'

test('the coach’s providers can be switched on, configured and their keys kept hidden', async ({
  page,
}) => {
  await page.goto('/settings?tab=coach')

  // Ollama: on, and it says why it can't answer (nothing listens at the test URL).
  const ollama = page.getByTestId('provider-ollama')
  await ollama.getByRole('switch').click()
  await expect(ollama.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  await expect(ollama.getByRole('status')).toContainText("Can't reach http://127.0.0.1:9/v1")

  // Another OpenAI-compatible API, with a key: shown while typing, hidden once saved.
  const other = page.getByTestId('provider-openai-compatible')
  await other.getByRole('switch').click()
  await other.getByLabel('URL').fill('http://127.0.0.1:9/v1')
  await other.getByLabel('Model').fill('test-model')
  const key = other.getByLabel('API key')
  await key.fill('sk-test-0123456789-secret-wxyz')
  await expect(key).toHaveAttribute('type', 'password')
  await other.getByRole('button', { name: 'Show key' }).click()
  await expect(key).toHaveAttribute('type', 'text')
  await other.getByRole('button', { name: 'Save' }).click()

  await expect(other.getByText('sk-test…wxyz')).toBeVisible()
  await expect(other.getByText('saved here')).toBeVisible()
  const kept = await (await page.request.get('/api/v1/settings/coach')).text()
  expect(kept).not.toContain('secret')

  // Kept across a reload; a saved key can be removed again.
  await page.reload()
  await expect(page.getByTestId('provider-ollama').getByRole('switch')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await other.getByRole('button', { name: 'Remove' }).click()
  await other.getByRole('button', { name: 'Save' }).click()
  await expect(other.getByText('sk-test…wxyz')).toBeHidden()
})

test('the board tab changes the board’s look', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Blue' }).click()
  const dark = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--board-dark').trim(),
  )
  expect(dark).toBe('#8ca2ad')
  await page.getByRole('tab', { name: 'Coach' }).click()
  await expect(page).toHaveURL(/tab=coach/)
})
