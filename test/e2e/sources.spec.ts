import { expect, test } from '@playwright/test'
import { at, makeItems, mockBootstrap, mockItemApis, registerPasskey } from './helpers.ts'

test.describe('sources', () => {
  test('sidebar views switch all-feeds filters', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const items = makeItems(3)
    const first = at(items, 0)
    first.is_bookmarked = true
    first.is_read = true
    await mockItemApis(page, items)
    await registerPasskey(page)
    const nav = page.getByRole('navigation', { name: 'Feeds' })
    const list = page.getByRole('feed', { name: 'Articles' })
    await expect(page.getByRole('heading', { name: 'All articles', level: 1 })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'All articles' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page).not.toHaveURL(/\/unread|\/bookmarks|\?filter=/)
    await expect(list.getByRole('article', { name: '記事 1' })).toBeVisible()
    await expect(list.getByRole('article', { name: '記事 2' })).toBeVisible()

    await nav.getByRole('link', { name: /^Unread/ }).click()
    await expect(page).toHaveURL(/\/unread/)
    await expect(page.getByRole('heading', { name: 'Unread', level: 1 })).toBeVisible()
    await expect(nav.getByRole('link', { name: /^Unread/ })).toHaveAttribute('aria-current', 'page')
    await expect(list.getByRole('article', { name: '記事 1' })).toHaveCount(0)
    await expect(list.getByRole('article', { name: '記事 2' })).toBeVisible()

    await nav.getByRole('link', { name: 'Bookmarked' }).click()
    await expect(page).toHaveURL(/\/bookmarks/)
    await expect(page.getByRole('heading', { name: 'Bookmarked', level: 1 })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Bookmarked' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(list.getByRole('article', { name: '記事 1' })).toBeVisible()
    await expect(list.getByRole('article', { name: '記事 2' })).toHaveCount(0)
  })

  test('selecting a sidebar source opens the first article', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const items = makeItems(3)
    const first = at(items, 0)
    first.is_read = true
    await mockItemApis(page, items)
    await registerPasskey(page)
    const nav = page.getByRole('navigation', { name: 'Feeds' })
    await nav.getByRole('link', { name: /^Unread/ }).click()
    await expect(page.getByRole('heading', { name: '記事 2', level: 1 })).toBeVisible()
    await expect(page).toHaveURL(/\/unread\/items\/[a-z2-7]{6,12}/)
    await nav.getByRole('link', { name: 'All articles' }).click()
    await expect(page.getByRole('heading', { name: '記事 1', level: 1 })).toBeVisible()
    await expect(page).toHaveURL((url) => /^\/items\/[a-z2-7]{6,12}$/.test(url.pathname))
  })

  test('creating a tag shows it in the sidebar', async ({ page }) => {
    await mockItemApis(page, makeItems(2))
    await registerPasskey(page)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Create tag' }).click()
    await page.getByLabel('Tag name').fill('仕事')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(
      page.getByRole('navigation', { name: 'Feeds' }).getByRole('link', { name: '仕事' }),
    ).toBeVisible()
  })

  test('keyboard-only subscribe then open and mark read', async ({ page }) => {
    const items = makeItems(3)
    await mockItemApis(page, items)
    await page.route('**/api/v1/feeds/discover', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            candidates: [
              {
                url: 'https://example.com/feed.xml',
                title: 'Example',
                subscribedFeedId: null,
                format: 'rss',
                itemCount: 3,
                latestItemAt: null,
                comments: false,
              },
            ],
            alreadySubscribedFeedId: null,
            failure: null,
          },
        }),
      })
    })
    await page.route('**/api/v1/feeds', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ created: true, feed: { id: 1, title: 'Example' } }),
        })
        return
      }
      await route.continue()
    })
    await registerPasskey(page)
    const addButton = page
      .getByRole('navigation', { name: 'Feeds' })
      .getByRole('button', { name: 'Add', exact: true })
    await addButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitem', { name: 'Add feed' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Add feed' }).press('Enter')
    await expect(page.locator('#add-feed-url')).toBeVisible()
    await page.getByLabel('Feed or site URL').fill('https://example.com/feed.xml')
    await page.keyboard.press('Enter')
    await expect(page.getByText('https://example.com/feed.xml')).toBeVisible()
    await page.getByRole('checkbox', { name: 'Example' }).check()
    await page
      .getByRole('dialog', { name: 'Add feed' })
      .getByRole('button', { name: 'Add' })
      .click()
    await expect(page.getByRole('status')).toHaveText('Feed added')
    await expect(page.getByRole('dialog', { name: 'Add feed' })).toHaveCount(0)
    await page.keyboard.press('j')
    await expect(page.getByRole('heading', { name: '記事 2', level: 1 })).toBeVisible()
    await page.keyboard.press('m')
  })

  test('shows why no feed was found, and keeps a subscribed candidate checked', async ({
    page,
  }) => {
    await mockItemApis(page, makeItems(1))
    let discoverCalls = 0
    await page.route('**/api/v1/feeds/discover', async (route) => {
      discoverCalls += 1
      if (discoverCalls === 1) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'discover_none',
              message: 'URLが見つかりませんでした(HTTP 404)',
              error_kind: 'not_found',
              status: 404,
            },
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            alreadySubscribedFeedId: null,
            failure: null,
            candidates: [
              {
                url: 'https://example.com/feed.xml',
                title: 'Example',
                subscribedFeedId: 1,
                format: 'rss',
                itemCount: 2,
                latestItemAt: null,
                comments: false,
              },
            ],
          },
        }),
      })
    })
    await registerPasskey(page)
    await page
      .getByRole('navigation', { name: 'Feeds' })
      .getByRole('button', { name: 'Add', exact: true })
      .click()
    await page.getByRole('menuitem', { name: 'Add feed' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add feed' })
    await page.getByLabel('Feed or site URL').fill('example.com')
    await dialog.getByRole('button', { name: 'Find', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('That page doesn’t exist (HTTP 404)')
    await expect(page.getByLabel('Feed or site URL')).toHaveValue('https://example.com/')

    await page.getByLabel('Feed or site URL').fill('https://example.com/feed.xml')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Find', exact: true }).click()
    const candidate = page.getByRole('checkbox', { name: 'Example' })
    await expect(candidate).toBeChecked()
    await expect(candidate).toBeDisabled()
    await expect(dialog.getByText('Subscribed')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
  })

  test('showing only feeds with unread articles hides the read ones', async ({ page }) => {
    await mockItemApis(page, makeItems(1))
    await mockBootstrap(page, {
      feeds: [
        { id: 1, public_id: 'feed1', title: 'Unread feed', unread_count: 2 },
        {
          id: 2,
          public_id: 'feed2',
          title: 'Read feed',
          unread_count: 0,
          tags: [{ id: 1, name: 'Read tag' }],
        },
      ],
      tags: [{ id: 1, name: 'Read tag', sort_index: 0 }],
    })
    await registerPasskey(page)
    const sidebar = page.getByRole('navigation', { name: 'Feeds' })
    await expect(sidebar.getByRole('link', { name: /Read feed/ })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Read tag' })).toBeVisible()

    await page.getByRole('link', { name: 'Settings' }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(dialog).toBeVisible()
    const check = dialog.getByRole('checkbox', {
      name: 'Show only feeds with unread articles',
    })
    await expect(check).not.toBeChecked()
    await check.click()
    await expect(check).toBeChecked()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(sidebar.getByRole('link', { name: /Unread feed/ })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: /Read feed/ })).toHaveCount(0)
    await expect(sidebar.getByRole('link', { name: 'Read tag' })).toHaveCount(0)

    await page.goto('/tags/1')
    await expect(sidebar.getByRole('link', { name: 'Read tag' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(sidebar.getByRole('link', { name: /Read feed/ })).toHaveCount(0)
  })

  test('feed context menu refreshes and shows a spinner', async ({ page }) => {
    let lastFetch: number | null = 100
    await mockItemApis(page, makeItems(1))
    await mockBootstrap(page, {
      feeds: [
        {
          id: 1,
          public_id: 'feed1',
          title: 'Example Feed',
          unread_count: 1,
          get last_fetch_at() {
            return lastFetch
          },
        },
      ],
    })
    await page.route('**/api/v1/feeds/1/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })
    await registerPasskey(page)
    const feedLink = page.getByRole('navigation', { name: 'Feeds' }).getByRole('link', {
      name: /Example Feed/,
    })
    await expect(feedLink).toBeVisible()
    await feedLink.click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: 'Edit feed' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Refresh' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Move to top' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Unsubscribe' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Refresh' }).click()
    await expect(page.getByLabel('Refreshing')).toBeVisible()
    lastFetch = 200
    await expect(page.getByLabel('Refreshing')).toHaveCount(0, { timeout: 15_000 })
  })
})
