import { expect, type Page, test } from '@playwright/test'
import {
  contrastRatio,
  dragSidebarToCollapse,
  dragSplitter,
  makeItem,
  makeItems,
  mockItemApis,
  readColor,
  registerPasskey,
} from './helpers.ts'

async function mockSvgImage(page: Page, url: string, width: number, height: number): Promise<void> {
  await page.route(url, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#c00"/></svg>`,
    })
  })
}

test.describe('layout', () => {
  test('article view shows the lead image below the header', async ({ page }) => {
    const items = [
      makeItem({
        lead_image_url: 'https://example.com/og.png',
      }),
    ]
    await mockItemApis(page, items)
    await registerPasskey(page)
    await page.getByRole('article', { name: '記事 1' }).click()
    const heading = page.getByRole('heading', { name: '記事 1', level: 1 })
    await expect(heading).toBeVisible()
    const view = page.locator('article').filter({ has: heading })
    const image = view.locator('header + img')
    await expect(image).toHaveAttribute('src', 'https://example.com/og.png')
  })

  test('article image opens a lightbox that fits the viewport without upscaling', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const items = [
      makeItem({
        lead_image_url: 'https://example.com/small.svg',
        content_html: '<p><img src="https://example.com/large.svg" alt="大きな画像"></p>',
      }),
    ]
    await mockSvgImage(page, 'https://example.com/small.svg', 80, 40)
    await mockSvgImage(page, 'https://example.com/large.svg', 4000, 2000)
    await mockItemApis(page, items)
    await registerPasskey(page)
    await page.getByRole('article', { name: '記事 1' }).click()
    const heading = page.getByRole('heading', { name: '記事 1', level: 1 })
    await expect(heading).toBeVisible()
    const lightbox = page.locator('[data-slot="lightbox"]')
    const image = page.locator('[data-slot="lightbox-image"]')

    await page.locator('article').filter({ has: heading }).locator('header + img').click()
    await expect(lightbox).toBeVisible()
    await expect(page.locator('[data-slot="dialog-header"]')).toHaveCount(0)
    expect(await lightbox.boundingBox()).toMatchObject({ x: 0, y: 0, width: 1440, height: 900 })
    await expect(image).toHaveJSProperty('naturalWidth', 80)
    const smallBox = await image.boundingBox()
    expect(smallBox?.width ?? 0).toBeGreaterThan(70)
    expect(smallBox?.width ?? 0).toBeLessThanOrEqual(80)
    expect(smallBox?.height ?? 0).toBeLessThanOrEqual(40)

    const articleUrl = page.url()
    await page.keyboard.press('j')
    await expect(lightbox).toBeVisible()
    expect(page.url()).toBe(articleUrl)
    await page.keyboard.press('Escape')
    await expect(lightbox).toHaveCount(0)

    await page.getByRole('img', { name: '大きな画像' }).click()
    await expect(lightbox).toBeVisible()
    await expect(image).toHaveJSProperty('naturalWidth', 4000)
    const largeBox = await image.boundingBox()
    expect(largeBox?.width ?? 0).toBeGreaterThan(1400)
    expect(largeBox?.width ?? 0).toBeLessThanOrEqual(1440)
    expect(largeBox?.height ?? 0).toBeLessThanOrEqual(900)
    await lightbox.click({ position: { x: 10, y: 10 } })
    await expect(lightbox).toHaveCount(0)
  })

  test('selected article row marks itself with a 3:1 rule', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockItemApis(page, makeItems(2))
    await registerPasskey(page)
    const selected = page.getByRole('article', { name: '記事 1' })
    await expect(selected).toHaveAttribute('aria-current', 'true')
    const rule = await readColor(selected, 'borderLeftColor')
    const surface = await readColor(selected, 'backgroundColor')
    expect(contrastRatio(rule, surface)).toBeGreaterThanOrEqual(3)

    const rules = await selected.evaluate((el) => ({
      below: getComputedStyle(el, '::after').backgroundColor,
      above: getComputedStyle(el, '::before').backgroundColor,
      canvas: getComputedStyle(document.documentElement).backgroundColor,
    }))
    expect(rules.below).toBe('rgba(0, 0, 0, 0)')
    expect(rules.above).toBe(rules.canvas)
  })

  test('columns dock side by side and resize at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockItemApis(page, makeItems(5))
    await registerPasskey(page)
    const sidebarBox = await page.locator('#reader-sidebar').boundingBox()
    const listBox = await page.locator('#reader-list').boundingBox()
    expect(
      (listBox?.x ?? 0) - ((sidebarBox?.x ?? 0) + (sidebarBox?.width ?? 0)),
    ).toBeLessThanOrEqual(2)

    const sidebarSplitter = page.getByRole('separator', { name: 'Sidebar width' })
    const sidebarBefore = Number(await sidebarSplitter.getAttribute('aria-valuenow'))
    await dragSplitter(sidebarSplitter, 250)
    expect(Number(await sidebarSplitter.getAttribute('aria-valuenow'))).toBeGreaterThan(
      sidebarBefore,
    )
    const listSplitter = page.getByRole('separator', { name: 'Article list width' })
    const listBefore = Number(await listSplitter.getAttribute('aria-valuenow'))
    await dragSplitter(listSplitter, 250)
    expect(Number(await listSplitter.getAttribute('aria-valuenow'))).toBeGreaterThan(listBefore)

    await listSplitter.focus()
    await page.keyboard.press('End')
    const articleBox = await page.locator('#reader-article').boundingBox()
    expect(articleBox?.width ?? 0).toBeGreaterThanOrEqual(279)

    await page.getByRole('article', { name: '記事 1' }).click()
    await expect(page.getByRole('heading', { name: '記事 1', level: 1 })).toBeVisible()
    await expect(page).toHaveURL(/\/items\/[a-z2-7]{6,12}/)
  })

  test('clicking a list row opens the article at 1000px', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 })
    const items = makeItems(5)
    await mockItemApis(page, items)
    await registerPasskey(page)
    const listSplitter = page.getByRole('separator', { name: 'Article list width' })
    await expect(listSplitter).toBeVisible()
    await expect(page.getByRole('separator', { name: 'Sidebar width' })).toHaveCount(0)
    await listSplitter.focus()
    await page.keyboard.press('End')
    const articleBox = await page.locator('#reader-article').boundingBox()
    expect(articleBox?.width ?? 0).toBeGreaterThanOrEqual(279)
    await page.getByRole('button', { name: 'Feeds', exact: true }).click()
    const sidebarSplitter = page.getByRole('separator', { name: 'Sidebar width' })
    await expect(sidebarSplitter).toBeVisible()
    const drawerWidthBefore = Number(await sidebarSplitter.getAttribute('aria-valuenow'))
    await dragSplitter(sidebarSplitter, 40)
    expect(Number(await sidebarSplitter.getAttribute('aria-valuenow'))).toBeGreaterThan(
      drawerWidthBefore,
    )
    await page.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('article', { name: '記事 1' }).click()
    await expect(page.getByRole('heading', { name: '記事 1', level: 1 })).toBeVisible()
    await expect(page).toHaveURL(/\/items\/[a-z2-7]{6,12}/)
  })

  test('collapsing the sidebar hides it until the menu is clicked, as column or drawer', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockItemApis(page, makeItems(5))
    await registerPasskey(page)
    await expect(page.getByRole('button', { name: 'Feeds', exact: true })).toHaveCount(0)
    await dragSidebarToCollapse(page)
    await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0)
    await expect(page.getByRole('separator', { name: 'Article list width' })).toBeVisible()
    await expect(page.getByRole('separator', { name: 'Sidebar width' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Feeds', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Feeds', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0)
    await expect(page.getByRole('separator', { name: 'Sidebar width' })).toBeVisible()
    await expect(page.getByRole('separator', { name: 'Article list width' })).toBeVisible()
    await expect(page.locator('#reader-sidebar')).toBeVisible()

    await dragSidebarToCollapse(page)
    await page.setViewportSize({ width: 1000, height: 800 })
    await page.getByRole('button', { name: 'Feeds', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible()
    await expect(page.getByRole('separator', { name: 'Sidebar width' })).toBeVisible()
    await expect(page.locator('#reader-sidebar')).toBeVisible()
  })
})
