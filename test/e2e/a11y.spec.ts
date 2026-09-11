import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { contrastRatio, readColor, registerPasskey } from './helpers.ts'

test.describe('accessibility', () => {
  test('login screen has no axe violations', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

  test('reader screen has no axe violations', async ({ page }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await registerPasskey(page)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'All articles' })).toBeVisible()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

  test('settings screen has no axe violations and keeps a 3:1 field boundary', async ({ page }) => {
    test.setTimeout(60_000)
    await registerPasskey(page)
    await page.goto('/settings')
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])

    const field = page.locator('#initial-unread-count')
    await expect(field).toBeVisible()
    const border = await readColor(field, 'borderTopColor')
    const background = await readColor(field, 'backgroundColor')
    expect(contrastRatio(border, background)).toBeGreaterThanOrEqual(3)
  })
})
