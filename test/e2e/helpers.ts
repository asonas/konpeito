import { type CDPSession, expect, type Locator, type Page } from '@playwright/test'

export async function resetDevAuth(page: Page): Promise<void> {
  const res = await page.request.post('/__test/reset')
  if (!res.ok()) {
    throw new Error(`reset failed: ${res.status()} ${await res.text()}`)
  }
}

export async function addVirtualAuthenticator(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page)
  await client.send('WebAuthn.enable')
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  return client
}

export async function registerPasskey(page: Page): Promise<void> {
  await resetDevAuth(page)
  await addVirtualAuthenticator(page)
  const bootstrap = process.env.BOOTSTRAP_TOKEN ?? 'dev-bootstrap-token'
  await page.goto(`/login?bootstrap=${encodeURIComponent(bootstrap)}`)
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'All articles' })).toBeVisible()
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'

export function publicIdFromNumber(id: number, length = 10): string {
  let n = id
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out = `${BASE32[n % 32]}${out}`
    n = Math.floor(n / 32)
  }
  return out
}

export type MockItem = {
  id: number
  public_id: string
  feed_id: number
  title: string
  url: string
  author: string | null
  summary: string
  lead_image_url: string | null
  published_at: number
  is_read: boolean
  is_bookmarked: boolean
  has_update: boolean
  has_full_content: boolean
  content_html?: string
  full_content_html?: string | null
  original_content_html?: string | null
}

export function makeItems(count: number, startId = 1): MockItem[] {
  const items: MockItem[] = []
  for (let i = 0; i < count; i += 1) {
    const id = startId + i
    items.push({
      id,
      public_id: publicIdFromNumber(id),
      feed_id: 1,
      title: `記事 ${id}`,
      url: `https://example.com/posts/${id}`,
      author: null,
      summary: `要約 ${id}`,
      lead_image_url: null,
      published_at: 1_700_000_000 - id,
      is_read: false,
      is_bookmarked: false,
      has_update: false,
      has_full_content: false,
    })
  }
  return items
}

export type Rgb = [number, number, number]

export type ColorProperty = 'backgroundColor' | 'borderLeftColor' | 'borderTopColor'

/**
 * 実際に描かれている色。`oklch()`や`light-dark()`は書式のまま返るので、
 * 一度canvasに塗ってRGBに直す。背景が透明なときは、見える色まで祖先をさかのぼって重ねる。
 */
export function readColor(target: Locator, property: ColorProperty): Promise<Rgb> {
  return target.evaluate((el, prop) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (ctx === null) {
      throw new Error('canvas')
    }
    const toRgba = (cssColor: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = cssColor
      ctx.fillRect(0, 0, 1, 1)
      const [red = 0, green = 0, blue = 0, alpha = 255] = ctx.getImageData(0, 0, 1, 1).data
      return [red, green, blue, alpha / 255]
    }
    if (prop !== 'backgroundColor') {
      const [red, green, blue] = toRgba(getComputedStyle(el)[prop])
      return [red, green, blue] as [number, number, number]
    }
    const layers: [number, number, number, number][] = []
    let node: Element | null = el
    while (node !== null) {
      const layer = toRgba(getComputedStyle(node).backgroundColor)
      if (layer[3] > 0) {
        layers.push(layer)
        if (layer[3] >= 1) {
          break
        }
      }
      node = node.parentElement
    }
    let result: [number, number, number] = [255, 255, 255]
    for (const [red, green, blue, alpha] of layers.reverse()) {
      result = [
        red * alpha + result[0] * (1 - alpha),
        green * alpha + result[1] * (1 - alpha),
        blue * alpha + result[2] * (1 - alpha),
      ]
    }
    return result
  }, property)
}

function relativeLuminance([red, green, blue]: Rgb): number {
  const [r = 0, g = 0, b = 0] = [red, green, blue].map((channel) => {
    const srgb = channel / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

export function at<T>(rows: T[], index: number): T {
  const row = rows[index]
  if (row === undefined) {
    throw new Error(`no row at ${index}`)
  }
  return row
}

export function makeItem(overrides: Partial<MockItem> = {}): MockItem {
  return Object.assign(at(makeItems(1), 0), overrides)
}

export async function mockItemApis(page: Page, allItems: MockItem[]): Promise<void> {
  await page.route('**/api/v1/items**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (request.method() === 'POST' && path.endsWith('/read')) {
      const body = request.postDataJSON() as { ids?: unknown; read?: unknown }
      if (Array.isArray(body.ids) && typeof body.read === 'boolean') {
        for (const id of body.ids) {
          if (typeof id !== 'number') {
            continue
          }
          const item = allItems.find((entry) => entry.id === id)
          if (item) {
            item.is_read = body.read
          }
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
      return
    }
    if (
      request.method() === 'POST' &&
      (path.endsWith('/bookmark') || path.endsWith('/mark_all_read'))
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
      return
    }
    if (request.method() === 'POST' && path.endsWith('/full_content')) {
      const ref = /^\/api\/v1\/items\/([^/]+)\/full_content$/.exec(path)?.[1] ?? ''
      const item = allItems.find((entry) => entry.public_id === ref || String(entry.id) === ref)
      if (item) {
        item.full_content_html = '<p>全文</p>'
        item.has_full_content = true
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ html: '<p>全文</p>' }),
      })
      return
    }
    const detail = /^\/api\/v1\/items\/([^/]+)$/.exec(path)
    if (detail && request.method() === 'GET') {
      const ref = detail[1] ?? ''
      const item = allItems.find((entry) => entry.public_id === ref || String(entry.id) === ref)
      if (!item) {
        await route.fulfill({ status: 404, body: 'not found' })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...item,
          content_html: item.content_html ?? `<p>${item.title}</p>`,
          full_content_html: item.full_content_html ?? null,
          original_content_html: item.original_content_html ?? null,
          enclosure_url: null,
          enclosure_mime: null,
          enclosure_length: null,
          language: 'ja',
          updated_at: null,
        }),
      })
      return
    }
    if (path === '/api/v1/items' && request.method() === 'GET') {
      const stream = url.searchParams.get('stream') ?? 'unread'
      const feedId = url.searchParams.get('feed_id')
      const limit = Number(url.searchParams.get('limit') ?? '50')
      const cursor = url.searchParams.get('cursor')
      const start = cursor ? Number(cursor) : 0
      let rows =
        stream === 'unread'
          ? allItems.filter((item) => !item.is_read)
          : stream === 'bookmarked'
            ? allItems.filter((item) => item.is_bookmarked)
            : allItems
      if (feedId !== null) {
        const id = Number(feedId)
        rows = rows.filter((item) => item.feed_id === id)
      }
      const slice = rows.slice(start, start + limit)
      const next = start + limit < rows.length ? String(start + limit) : null
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: slice, next_cursor: next }),
      })
      return
    }
    await route.continue()
  })
}

export async function dragSplitter(splitter: Locator, dx: number): Promise<void> {
  const box = await splitter.boundingBox()
  if (box === null) {
    throw new Error('splitter has no box')
  }
  const x = box.x + 1
  const y = box.y + 80
  const mouse = splitter.page().mouse
  await mouse.move(x, y)
  await mouse.down()
  await mouse.move(x + dx, y)
  await mouse.up()
}

export async function dragSidebarToCollapse(page: Page): Promise<void> {
  const splitter = page.getByRole('separator', { name: 'Sidebar width' })
  await expect(splitter).toBeVisible()
  const width = Number(await splitter.getAttribute('aria-valuenow'))
  await dragSplitter(splitter, -(width - 80))
  await expect(page.getByRole('button', { name: 'Feeds', exact: true })).toBeVisible()
}

export type MockFeed = {
  id: number
  public_id: string
  title: string
  unread_count: number
  show_lead_image?: number
  fetch_full_content?: number
  last_fetch_at?: number | null
  tags?: { id: number; name: string }[]
}

export async function mockBootstrap(
  page: Page,
  override: { feeds: MockFeed[]; tags?: { id: number; name: string; sort_index: number }[] },
): Promise<void> {
  await page.route('**/api/v1/bootstrap', async (route) => {
    const response = await route.fetch()
    const json = (await response.json()) as Record<string, unknown>
    json.feeds = override.feeds.map((feed) => ({
      custom_title: null,
      fetch_full_content: 0,
      show_lead_image: 1,
      disabled: 0,
      disabled_reason: null,
      last_error_kind: null,
      last_error: null,
      last_fetch_at: null,
      icon_url: null,
      tags: [],
      ...feed,
    }))
    if (override.tags !== undefined) {
      json.tags = override.tags
    }
    await route.fulfill({ response, body: JSON.stringify(json) })
  })
}
