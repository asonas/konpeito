import { expect, test } from '@playwright/test'

const PROD_URL = process.env.PROD_SMOKE_URL

test('production login page loads', async ({ browser }) => {
  test.skip(!PROD_URL, 'set PROD_SMOKE_URL=https://your-instance.example to hit production')
  const page = await browser.newPage()
  await page.goto(new URL('/login', PROD_URL).toString())
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible()
  await page.close()
})
