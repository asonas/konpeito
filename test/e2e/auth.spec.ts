import { expect, test } from '@playwright/test'
import { registerPasskey } from './helpers.ts'

test.describe('passkey auth', () => {
  test('register, login, revoke session, and login again', async ({ page }) => {
    await registerPasskey(page)
    await expect(page.getByRole('navigation', { name: 'Feeds' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'All articles' })).toBeVisible()

    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Sessions' }).click()
    await page.getByRole('button', { name: 'Revoke', exact: true }).first().click()
    await page
      .getByRole('alertdialog', { name: 'Revoke this device’s session' })
      .getByRole('button', { name: 'Revoke' })
      .click()
    await expect(page).toHaveURL(/\/login/)

    await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 15_000 })

    await page.goto('/settings')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('does not register when a credential already exists', async ({ page }) => {
    test.setTimeout(60_000)
    await registerPasskey(page)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
    const bootstrap = process.env.BOOTSTRAP_TOKEN ?? 'dev-bootstrap-token'
    await page.goto(`/login?bootstrap=${encodeURIComponent(bootstrap)}`)
    await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
    await expect(page.getByText('Bootstrap is disabled')).toBeVisible()
  })
})
