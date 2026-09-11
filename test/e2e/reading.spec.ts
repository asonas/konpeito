import { expect, test } from '@playwright/test'
import { at, makeItem, makeItems, mockBootstrap, mockItemApis, registerPasskey } from './helpers.ts'

test.describe('reading', () => {
  test('keyboard shortcuts move focus and change state', async ({ page }) => {
    const items = makeItems(5)
    await mockItemApis(page, items)
    await page.route('**/api/v1/feeds/**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
        return
      }
      await route.continue()
    })
    await registerPasskey(page)
    await expect(page.getByRole('feed', { name: 'Articles' })).toBeVisible()
    await expect(page.getByRole('article', { name: '記事 1' })).toBeVisible()

    await page.keyboard.press('n')
    await expect(page.getByRole('article', { name: '記事 2' })).toHaveAttribute(
      'aria-current',
      'true',
    )

    await page.keyboard.press('p')
    await expect(page.getByRole('article', { name: '記事 1' })).toHaveAttribute(
      'aria-current',
      'true',
    )

    await page.keyboard.press('j')
    await expect(page.getByRole('heading', { name: '記事 2', level: 1 })).toBeVisible()

    await page.keyboard.press('k')
    await expect(page.getByRole('heading', { name: '記事 1', level: 1 })).toBeVisible()

    await page.keyboard.press('o')
    await expect(page).not.toHaveURL(/\/items\//)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/items\/[a-z2-7]{6,12}/)

    const popupPromise = page.waitForEvent('popup')
    await page.keyboard.press('v')
    const popup = await popupPromise
    expect(popup.url()).toContain('example.com/posts/')
    await popup.close()

    await page.keyboard.press('m')
    await expect(page.getByRole('button', { name: 'Mark as read' })).toBeVisible()
    await page.keyboard.press('s')
    await expect(page.getByRole('button', { name: 'Remove bookmark' })).toBeVisible()
    await page.keyboard.press('f')
    await expect(page.getByRole('button', { name: 'Show feed content' })).toBeVisible()
    await expect(page.locator('.article-body')).toHaveText('全文')

    const searchButton = page.getByRole('button', { name: 'Search' })
    const searchField = page.getByRole('searchbox', { name: 'Search' })
    await page.keyboard.press('/')
    await expect(searchField).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(searchField).toHaveCount(0)
    await expect(searchButton).toBeFocused()
    await page.keyboard.press('/')
    await expect(searchField).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(searchField).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeFocused()

    await page.keyboard.press('g')
    await page.keyboard.press('s')
    await expect(page).toHaveURL(/\/bookmarks/)
    await page.keyboard.press('g')
    await page.keyboard.press('a')
    await expect(page).not.toHaveURL(/\/unread|\/bookmarks/)
    await page.keyboard.press('g')
    await page.keyboard.press('u')
    await expect(page).toHaveURL(/\/unread/)

    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)
  })

  test('virtualized unread list keeps DOM rows under 100', async ({ page }) => {
    await mockItemApis(page, makeItems(10_000))
    await registerPasskey(page)
    const feed = page.getByRole('feed', { name: 'Articles' })
    await expect(feed).toBeVisible()
    const scroller = feed.locator('xpath=..')
    const scrollHeight = () => scroller.evaluate((node) => node.scrollHeight)
    let lastHeight = await scrollHeight()
    for (let i = 0; i < 4; i += 1) {
      await scroller.evaluate((node) => {
        node.scrollTop = node.scrollHeight
      })
      await expect.poll(scrollHeight).toBeGreaterThan(lastHeight)
      lastHeight = await scrollHeight()
      expect(await feed.getByRole('article').count()).toBeLessThanOrEqual(100)
    }
  })

  test('mobile back keeps list scroll and selected row', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const items = makeItems(30)
    await mockItemApis(page, items)
    await registerPasskey(page)
    const feed = page.getByRole('feed', { name: 'Articles' })
    await expect(feed).toBeVisible()
    const scroller = feed.locator('xpath=..')
    await scroller.evaluate((node) => {
      node.scrollTop = 400
    })
    const selected = page.getByRole('article', { name: '記事 8' })
    await selected.click()
    await expect(page.getByRole('heading', { name: '記事 8', level: 1 })).toBeVisible()
    const back = page.getByRole('link', { name: 'Back to list' })
    await expect(back).toBeVisible()
    await expect(back).toHaveText('')
    await page.goBack()
    await expect(feed).toBeVisible()
    await expect(page.getByRole('article', { name: '記事 8' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    const top = await scroller.evaluate((node) => node.scrollTop)
    expect(top).toBeGreaterThan(100)
  })

  test('article view toggles the read button', async ({ page }) => {
    const items = makeItems(1)
    await mockItemApis(page, items)
    await registerPasskey(page)
    await page.getByRole('article', { name: '記事 1' }).click()
    await expect(page.getByRole('heading', { name: '記事 1', level: 1 })).toBeVisible()
    await expect(page.getByText('7:13 AM · Nov 15, 2023')).toBeVisible()
    const toolbar = page.getByRole('toolbar', { name: 'Article actions' })
    const toolbarButtons = toolbar.getByRole('button')
    await expect(toolbarButtons).toHaveCount(3)
    await expect(toolbarButtons.nth(0)).toHaveAccessibleName('Mark as unread')
    await expect(toolbarButtons.nth(1)).toHaveAccessibleName('Bookmark')
    await expect(toolbarButtons.nth(2)).toHaveAccessibleName('Show full article')
    const original = toolbar.getByRole('link', { name: 'Open original' })
    await expect(original).toHaveAttribute('href', 'https://example.com/posts/1')
    await expect(original).toHaveAttribute('target', '_blank')
    await expect(original).toHaveAttribute('rel', 'noopener noreferrer')
    await page.getByRole('button', { name: 'Mark as unread' }).click()
    await expect(page.getByRole('button', { name: 'Mark as read' })).toBeVisible()
    await page.getByRole('button', { name: 'Mark as read' }).click()
    await expect(page.getByRole('button', { name: 'Mark as unread' })).toBeVisible()
  })

  test('article view swaps the body for the full content and back', async ({ page }) => {
    const items = makeItems(1)
    await mockItemApis(page, items)
    const fullContentRequests: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/full_content')) {
        fullContentRequests.push(request.url())
      }
    })
    await registerPasskey(page)
    await page.getByRole('article', { name: '記事 1' }).click()
    const body = page.locator('.article-body')
    await expect(body).toHaveText('記事 1')

    const showFull = page.getByRole('button', { name: 'Show full article' })
    await expect(showFull).toHaveAttribute('aria-pressed', 'false')
    await showFull.click()
    const backToFeed = page.getByRole('button', { name: 'Show feed content' })
    await expect(backToFeed).toHaveAttribute('aria-pressed', 'true')
    await expect(body).toHaveText('全文')
    expect(fullContentRequests).toHaveLength(1)

    await backToFeed.click()
    await expect(showFull).toHaveAttribute('aria-pressed', 'false')
    await expect(body).toHaveText('記事 1')
    await showFull.click()
    await expect(body).toHaveText('全文')
    expect(fullContentRequests).toHaveLength(1)
  })

  test('updated articles show an inline body diff that the toolbar can hide', async ({ page }) => {
    const items = makeItems(2)
    const updated = items[0]
    const plain = items[1]
    if (!updated || !plain) {
      throw new Error('expected items')
    }
    updated.has_update = true
    updated.original_content_html = '<p>今日は晴れです。明日は雨です。</p>'
    updated.content_html = '<p>今日は晴れです。明日は雪です。</p>'
    await mockItemApis(page, items)
    await registerPasskey(page)
    await page.getByRole('article', { name: '記事 1' }).click()
    await expect(page.getByRole('heading', { name: '記事 1', level: 1 })).toBeVisible()

    const toolbar = page.getByRole('toolbar', { name: 'Article actions' })
    await expect(toolbar.getByRole('button')).toHaveCount(4)
    const hideDiff = toolbar.getByRole('button', { name: 'Hide changes' })
    await expect(hideDiff).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('dialog', { name: '変更点' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Show changes' })).toHaveCount(0)

    const body = page.locator('.article-body')
    await expect(body.locator('ins')).toHaveCount(1)
    await expect(body.locator('del')).toHaveCount(1)

    await hideDiff.click()
    const showDiff = toolbar.getByRole('button', { name: 'Show changes' })
    await expect(showDiff).toHaveAttribute('aria-pressed', 'false')
    await expect(body.locator('ins')).toHaveCount(0)
    await expect(body.locator('del')).toHaveCount(0)
    await expect(body).toHaveText('今日は晴れです。明日は雪です。')

    await page.getByRole('article', { name: '記事 2' }).click()
    await expect(page.getByRole('heading', { name: '記事 2', level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show changes' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Hide changes' })).toHaveCount(0)
  })

  test('a feed set to full content fetches it when the article opens', async ({ page }) => {
    const items = makeItems(1)
    await mockItemApis(page, items)
    await mockBootstrap(page, {
      feeds: [
        {
          id: 1,
          public_id: 'feed1',
          title: '全文フィード',
          fetch_full_content: 1,
          unread_count: 1,
        },
      ],
    })
    await registerPasskey(page)
    await page.getByRole('article', { name: '記事 1' }).click()
    await expect(page.locator('.article-body')).toHaveText('全文')
    await expect(page.getByRole('button', { name: 'Show feed content' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('opening an article from all feeds keeps the mixed list', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const items = makeItems(3)
    const second = at(items, 1)
    second.feed_id = 2
    await mockItemApis(page, items)
    await registerPasskey(page)
    const list = page.getByRole('feed', { name: 'Articles' })
    await expect(page.getByRole('heading', { name: 'All articles', level: 1 })).toBeVisible()
    await list.getByRole('article', { name: '記事 1' }).click()
    await expect(page.getByRole('heading', { name: '記事 1', level: 1 })).toBeVisible()
    await expect(page).toHaveURL((url) => /^\/items\/[a-z2-7]{6,12}$/.test(url.pathname))
    await expect(page.getByRole('heading', { name: 'All articles', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'All articles' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(list.getByRole('article', { name: '記事 1' })).toBeVisible()
    await expect(list.getByRole('article', { name: '記事 2' })).toBeVisible()
  })

  test('unread list keeps a just-read item until the filter changes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockItemApis(page, makeItems(3))
    await registerPasskey(page)
    const nav = page.getByRole('navigation', { name: 'Feeds' })
    await nav.getByRole('link', { name: /^Unread/ }).click()
    const list = page.getByRole('feed', { name: 'Articles' })
    await list.getByRole('article', { name: '記事 1' }).click()
    await expect(page.getByRole('heading', { name: '記事 1', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Next article' }).click()
    await expect(page.getByRole('heading', { name: '記事 2', level: 1 })).toBeVisible()
    await expect(list.getByRole('article', { name: '記事 1' })).toBeVisible()
    await expect(list.getByRole('article', { name: '記事 2' })).toBeVisible()
    await list.getByRole('article', { name: '記事 1' }).click()
    await expect(page.getByRole('button', { name: 'Mark as unread' })).toBeVisible()
    await nav.getByRole('link', { name: 'All articles' }).click()
    await nav.getByRole('link', { name: /^Unread/ }).click()
    await expect(list.getByRole('article', { name: '記事 1' })).toHaveCount(0)
    await expect(list.getByRole('article', { name: '記事 2' })).toHaveCount(0)
    await expect(list.getByRole('article', { name: '記事 3' })).toBeVisible()
  })

  test('mark all read asks for confirmation', async ({ page }) => {
    await mockItemApis(page, makeItems(2))
    await registerPasskey(page)
    await page.getByRole('button', { name: 'Mark all as read' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Mark all as read?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Mark as read' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'All marked as read' })).toBeVisible()
  })

  test('article context menu matches the header actions', async ({ page }) => {
    const items = [
      makeItem({
        content_html: '<p>本文 <a href="https://example.com/in">中のリンク</a></p>',
      }),
    ]
    await mockItemApis(page, items)
    await registerPasskey(page)
    const row = page.getByRole('article', { name: '記事 1' })
    await row.click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: 'Mark as read' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Bookmark' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Show full article' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Open original' })).toBeVisible()
    await page.keyboard.press('Escape')
    await row.click()
    await expect(page.getByRole('heading', { name: '記事 1', level: 1 })).toBeVisible()
    await expect(
      page.locator('.article-body').getByRole('link', { name: '中のリンク' }),
    ).toBeVisible()
  })
})
