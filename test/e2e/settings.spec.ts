import { expect, test } from '@playwright/test'
import { makeItems, mockItemApis, registerPasskey } from './helpers.ts'

test.describe('settings', () => {
  test('settings opens as a modal, applies display changes, and renders every tab', async ({
    page,
  }) => {
    await mockItemApis(page, makeItems(2))
    await registerPasskey(page)
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings\/display/)
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(dialog).toBeVisible()

    await dialog.getByRole('combobox', { name: 'Theme' }).click()
    await page.getByRole('option', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await expect(dialog.getByRole('tabpanel')).toBeVisible()
    const tabs = ['Data', 'Storage', 'Fetch status', 'Passkeys', 'Sessions', 'Access tokens']
    for (const name of tabs) {
      await page.getByRole('tab', { name }).click()
      const panel = dialog.getByRole('tabpanel', { name })
      await expect(panel, name).toBeVisible()
      await expect(panel, name).not.toBeEmpty()
    }

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/')
    await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Feeds' })).toBeVisible()
  })

  test('display settings put language first and switch English to Japanese', async ({ page }) => {
    await registerPasskey(page)
    await page.getByRole('link', { name: 'Settings' }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(dialog).toBeVisible()
    const languageSelect = dialog.getByRole('combobox', { name: 'Language' })
    const themeSelect = dialog.getByRole('combobox', { name: 'Theme' })
    const languageBox = await languageSelect.boundingBox()
    const themeBox = await themeSelect.boundingBox()
    expect(languageBox?.y ?? 0).toBeLessThan(themeBox?.y ?? 0)
    await expect(languageSelect).toContainText('English')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await languageSelect.click()
    await page.getByRole('option', { name: '日本語' }).click()
    await expect(page.getByRole('dialog', { name: '設定' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
    await expect(page.getByRole('combobox', { name: '言語' })).toContainText('日本語')
  })
})
