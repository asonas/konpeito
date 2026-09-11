import { Hono } from 'hono'
import { apiError } from '../../shared/errors.ts'
import {
  cursorPayloadSchema,
  DEFAULT_SETTINGS,
  itemsQuerySchema,
  settingsSchema,
} from '../../shared/schemas.ts'
import {
  type FeedForClient,
  type ItemForDetail,
  type ItemForList,
  feedForClient as projectFeed,
} from '../lib/client-shape.ts'
import { decodeCursorBytes, encodeCursor, nowSec } from '../lib/crypto.ts'
import { parsePositiveInt } from '../lib/ids.ts'
import { zv } from '../lib/validate.ts'
import { requireJsonAndOrigin } from '../middleware/json-origin.ts'
import { applyAppHeaders, securityHeadersMiddleware } from '../middleware/security-headers.ts'
import { image } from '../routes/image.ts'
import { type ParsedSearch, parseSearchQuery } from '../services/search.ts'
import type { AppEnv } from '../types.ts'
import { parseDemoFeeds } from './config.ts'
import { loadFullContent, peekFullContent } from './full-content.ts'
import { type DemoFeed, type DemoItem, type DemoSnapshot, loadSnapshot } from './snapshot.ts'

const DEMO_USER_HANDLE = '00000000-0000-4000-8000-000000000000'
const DEMO_SETTINGS = settingsSchema.parse({
  ...DEFAULT_SETTINGS,
  user_handle: DEMO_USER_HANDLE,
})

const EMPTY_STREAMS = new Set(['bookmarked', 'recently_read', 'updated'])

function feedForClient(feed: DemoFeed, origin: string): FeedForClient {
  return projectFeed(feed, feed.icon_query === null ? null : `${origin}/img${feed.icon_query}`)
}

function itemForList(item: DemoItem): ItemForList {
  return {
    id: item.id,
    feed_id: item.feed_id,
    title: item.title,
    url: item.url,
    author: item.author,
    summary: item.summary,
    lead_image_url: item.lead_image_url,
    published_at: item.published_at,
    is_read: false,
    is_bookmarked: false,
    has_update: false,
    public_id: null,
  }
}

function itemForDetail(item: DemoItem, fullContentHtml: string | null): ItemForDetail {
  return {
    ...itemForList(item),
    updated_at: item.updated_at,
    has_full_content: fullContentHtml !== null,
    content_html: item.content_html,
    full_content_html: fullContentHtml,
    original_content_html: null,
    enclosure_url: item.enclosure_url,
    enclosure_mime: item.enclosure_mime,
    enclosure_length: item.enclosure_length,
    language: item.language,
  }
}

function matchesSearch(item: DemoItem, snapshot: DemoSnapshot, search: ParsedSearch): boolean {
  if (search.bookmarked === true || search.unread === false) {
    return false
  }
  if (search.feedId !== null && item.feed_id !== search.feedId) {
    return false
  }
  if (search.tagName !== null) {
    const feed = snapshot.feeds.find((entry) => entry.id === item.feed_id)
    if (feed === undefined || !feed.tags.some((tag) => tag.name === search.tagName)) {
      return false
    }
  }
  if (search.after !== null && item.published_at < search.after) {
    return false
  }
  if (search.before !== null && item.published_at > search.before) {
    return false
  }
  if (search.text.length > 0 && !item.search_text.includes(search.text.toLowerCase())) {
    return false
  }
  return true
}

function decodeCursor(raw: string): { p: number; i: number } | null {
  try {
    const parsed = cursorPayloadSchema.safeParse(JSON.parse(decodeCursorBytes(raw)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

type ItemsQuery = {
  stream: string
  feed_id?: number | undefined
  tag_id?: number | undefined
  q?: string | undefined
  order: 'asc' | 'desc'
  limit: number
  cursor?: string | undefined
}

function selectItems(snapshot: DemoSnapshot, query: ItemsQuery) {
  if (EMPTY_STREAMS.has(query.stream)) {
    return { items: [], next_cursor: null }
  }
  const search = query.q !== undefined && query.q.length > 0 ? parseSearchQuery(query.q) : null
  const tagFeedIds =
    query.tag_id === undefined
      ? null
      : snapshot.feeds
          .filter((feed) => feed.tags.some((tag) => tag.id === query.tag_id))
          .map((feed) => feed.id)

  let items = snapshot.items.filter((item) => {
    if (query.feed_id !== undefined && item.feed_id !== query.feed_id) {
      return false
    }
    if (tagFeedIds !== null && !tagFeedIds.includes(item.feed_id)) {
      return false
    }
    if (search !== null && !matchesSearch(item, snapshot, search)) {
      return false
    }
    return true
  })
  if (query.order === 'asc') {
    items = [...items].reverse()
  }
  if (query.cursor !== undefined) {
    const cursor = decodeCursor(query.cursor)
    if (cursor === null) {
      return null
    }
    items = items.filter((item) =>
      query.order === 'asc'
        ? item.published_at > cursor.p || (item.published_at === cursor.p && item.id > cursor.i)
        : item.published_at < cursor.p || (item.published_at === cursor.p && item.id < cursor.i),
    )
  }
  const page = items.slice(0, query.limit)
  const last = page.at(-1)
  const next_cursor =
    page.length === query.limit && last !== undefined
      ? encodeCursor({ p: last.published_at, i: last.id })
      : null
  return { items: page, next_cursor }
}

async function snapshotOf(c: {
  env: Env
  executionCtx: { waitUntil: (promise: Promise<unknown>) => void }
}): Promise<DemoSnapshot> {
  return loadSnapshot(
    parseDemoFeeds(c.env.DEMO_FEEDS),
    c.env.IMAGE_PROXY_KEY,
    c.executionCtx,
    nowSec(),
  )
}

export const demo = new Hono<AppEnv>()
  .use('*', securityHeadersMiddleware())
  .use('*', async (c, next) => {
    applyAppHeaders(c)
    await next()
  })
  .onError((err, c) => {
    console.log({ event: 'demo.error', message: err instanceof Error ? err.message : 'error' })
    return c.json(apiError('internal', 'Internal error'), 500)
  })
  .get('/robots.txt', (c) =>
    c.text('User-agent: *\nDisallow: /\n', 200, { 'Content-Type': 'text/plain; charset=utf-8' }),
  )
  .get('/login', (c) => c.redirect('/', 302))
  .use('/img', async (c, next) => {
    if (c.req.query('i') !== undefined) {
      return c.text('Not Found', 404)
    }
    await next()
  })
  .route('/img', image)
  .get('/api/v1/bootstrap', async (c) => {
    const snapshot = await snapshotOf(c)
    const origin = new URL(c.req.url).origin
    const feeds = snapshot.feeds.map((feed) => feedForClient(feed, origin))
    return c.json({
      feeds,
      tags: snapshot.tags,
      unread_count: feeds.reduce((sum, feed) => sum + feed.unread_count, 0),
      settings: DEMO_SETTINGS,
      demo: true,
    })
  })
  .get('/api/v1/items', zv('query', itemsQuerySchema), async (c) => {
    const query = c.req.valid('query')
    const snapshot = await snapshotOf(c)
    const result = selectItems(snapshot, query)
    if (result === null) {
      return c.json(apiError('validation_error', 'Invalid cursor'), 400)
    }
    const items = result.items.map(itemForList)
    if (result.next_cursor !== null) {
      return c.json({ items, next_cursor: result.next_cursor })
    }
    return c.json({ items })
  })
  .get('/api/v1/items/:id', async (c) => {
    const id = parsePositiveInt(c.req.param('id'))
    if (id === null) {
      return c.json(apiError('validation_error', 'Invalid id'), 400)
    }
    const snapshot = await snapshotOf(c)
    const item = snapshot.items.find((entry) => entry.id === id)
    if (item === undefined) {
      return c.json(apiError('item_not_found', 'Item not found'), 404)
    }
    return c.json(itemForDetail(item, await peekFullContent(item.id)))
  })
  .post('/api/v1/items/:id/full_content', requireJsonAndOrigin(), async (c) => {
    const id = parsePositiveInt(c.req.param('id'))
    if (id === null) {
      return c.json(apiError('validation_error', 'Invalid id'), 400)
    }
    const snapshot = await snapshotOf(c)
    const item = snapshot.items.find((entry) => entry.id === id)
    const feed = item === undefined ? undefined : snapshot.feeds.find((f) => f.id === item.feed_id)
    if (item === undefined || feed === undefined) {
      return c.json(apiError('item_not_found', 'Item not found'), 404)
    }
    const result = await loadFullContent(item, feed, c.env.IMAGE_PROXY_KEY, nowSec())
    if (result.kind === 'failed') {
      return c.json(
        apiError('extract_failed', `Failed to extract full content (${result.reason})`),
        422,
      )
    }
    return c.json({ html: result.html })
  })
  .all('*', (c) => c.json(apiError('not_found', 'Not found'), 404))
