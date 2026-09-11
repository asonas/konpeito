import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { demo } from '../../src/server/demo/index.ts'
import { ORIGIN, toBody } from '../helpers.ts'

const FEED_A = 'https://a.example/feed.xml'
const FEED_B = 'https://b.example/feed.xml'

function rss(title: string, site: string, items: { title: string; date: string }[]): string {
  const entries = items
    .map(
      (item) => `<item>
      <title>${item.title}</title>
      <link>${site}posts/${encodeURIComponent(item.title)}</link>
      <guid isPermaLink="false">${item.title}</guid>
      <pubDate>${item.date}</pubDate>
      <description>${item.title}の本文です。konpeitoのデモ。</description>
    </item>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${title}</title>
  <link>${site}</link>
  ${entries}
</channel></rss>`
}

const BODIES: Record<string, { body: string | Uint8Array; type: string }> = {
  [FEED_A]: {
    body: rss('ブログA', 'https://a.example/', [
      { title: '古い記事', date: 'Wed, 01 Jan 2020 00:00:00 GMT' },
      { title: '新しい記事', date: 'Mon, 01 Sep 2026 00:00:00 GMT' },
    ]),
    type: 'application/rss+xml',
  },
  [FEED_B]: {
    body: rss('ブログB', 'https://b.example/', [
      { title: '真ん中の記事', date: 'Fri, 01 Jan 2021 00:00:00 GMT' },
    ]),
    type: 'application/rss+xml',
  },
  'https://a.example/': { body: '<html><head><title>A</title></head></html>', type: 'text/html' },
  'https://b.example/': { body: '<html><head><title>B</title></head></html>', type: 'text/html' },
  'https://a.example/favicon.ico': { body: new Uint8Array([1, 2, 3, 4]), type: 'image/x-icon' },
  'https://b.example/favicon.ico': { body: new Uint8Array([1, 2, 3, 4]), type: 'image/x-icon' },
}

const ARTICLE_PAGE = `<html><head><title>新しい記事</title></head><body>
  <nav><a href="https://a.example/">トップ</a></nav>
  <article>
    <h1>新しい記事</h1>
    ${'<p>フィードには要約しか出ていない、記事ページだけにある本文です。konpeitoのデモ。</p>'.repeat(12)}
    <p><img src="https://a.example/photo.jpg" alt=""></p>
  </article>
</body></html>`

function stubFetch(): () => void {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const found = BODIES[url]
    if (found === undefined) {
      if (url.startsWith('https://a.example/posts/')) {
        return new Response(ARTICLE_PAGE, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return new Response('not found', { status: 404 })
    }
    return new Response(toBody(found.body), {
      status: 200,
      headers: { 'Content-Type': found.type },
    })
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

/**
 * デモはデータベースを一切読まない。テストでもそれを型ではなく実行で確かめたいので、
 * 触れたら落ちるD1を渡す。デモのデプロイにはそもそもD1のバインディングが無い。
 */
const forbiddenDb = new Proxy(
  {},
  {
    get() {
      throw new Error('the demo must not touch the database')
    },
  },
) as D1Database

const demoEnv: Env = {
  ...env,
  DB: forbiddenDb,
  IMAGE_PROXY_KEY: 'demo-image-proxy-key',
  DEMO_MODE: '1',
  DEMO_FEEDS: JSON.stringify([
    { url: FEED_A, tags: ['ブログ'] },
    { url: FEED_B, title: 'B（表示名）', tags: ['ブログ', 'ニュース'] },
  ]),
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} }

async function call(path: string, init?: RequestInit): Promise<Response> {
  return demo.fetch(new Request(`${ORIGIN}${path}`, init), demoEnv, ctx)
}

let restore: (() => void) | undefined

afterEach(() => {
  restore?.()
  restore = undefined
})

describe('demo mode', () => {
  it('serves the bootstrap without a session, from the configured feeds', async () => {
    restore = stubFetch()
    const res = await call('/api/v1/bootstrap')
    expect(res.status).toBe(200)
    const body = await res.json<{
      demo: boolean
      unread_count: number
      settings: { auto_mark_read: boolean }
      feeds: { title: string; custom_title: string | null; icon_url: string | null }[]
      tags: { name: string }[]
    }>()
    expect(body.demo).toBe(true)
    expect(body.settings.auto_mark_read).toBe(true)
    expect(body.feeds.map((feed) => feed.title)).toEqual(['ブログA', 'ブログB'])
    expect(body.feeds[1]?.custom_title).toBe('B（表示名）')
    expect(body.feeds[0]?.icon_url).toMatch(/\/img\?u=.+&s=.+/)
    expect(body.tags.map((tag) => tag.name)).toEqual(['ブログ', 'ニュース'])
    expect(body.unread_count).toBe(3)
  })

  it('lists items newest first, and filters by feed and by search', async () => {
    restore = stubFetch()
    const all = await (await call('/api/v1/items?stream=unread')).json<{
      items: { id: number; feed_id: number; title: string }[]
    }>()
    expect(all.items.map((item) => item.title)).toEqual(['新しい記事', '真ん中の記事', '古い記事'])

    const feedId = all.items.find((item) => item.title === '真ん中の記事')?.feed_id
    const byFeed = await (await call(`/api/v1/items?stream=all&feed_id=${feedId}`)).json<{
      items: { title: string }[]
    }>()
    expect(byFeed.items.map((item) => item.title)).toEqual(['真ん中の記事'])

    const searched = await (await call('/api/v1/items?stream=all&q=真ん中')).json<{
      items: { title: string }[]
    }>()
    expect(searched.items.map((item) => item.title)).toEqual(['真ん中の記事'])
  })

  it('pages with a cursor', async () => {
    restore = stubFetch()
    const first = await (await call('/api/v1/items?stream=all&limit=2')).json<{
      items: { title: string }[]
      next_cursor?: string
    }>()
    expect(first.items).toHaveLength(2)
    expect(first.next_cursor).toBeTypeOf('string')
    const second = await (
      await call(`/api/v1/items?stream=all&limit=2&cursor=${first.next_cursor}`)
    ).json<{ items: { title: string }[]; next_cursor?: string }>()
    expect(second.items.map((item) => item.title)).toEqual(['古い記事'])
    expect(second.next_cursor).toBeUndefined()
  })

  it('returns an article, and 404 for an unknown one', async () => {
    restore = stubFetch()
    const list = await (await call('/api/v1/items?stream=all')).json<{ items: { id: number }[] }>()
    const id = list.items[0]?.id ?? 0
    const item = await (await call(`/api/v1/items/${id}`)).json<{
      title: string
      content_html: string | null
      has_full_content: boolean
    }>()
    expect(item.title).toBe('新しい記事')
    expect(item.content_html).toContain('本文')
    expect(item.has_full_content).toBe(false)
    expect((await call('/api/v1/items/999999')).status).toBe(404)
  })

  it('refuses every write, the Google Reader API and passkey registration', async () => {
    restore = stubFetch()
    const writes: [string, RequestInit][] = [
      ['/api/v1/items/read', { method: 'POST', body: '{"ids":[1],"read":true}' }],
      ['/api/v1/items/bookmark', { method: 'POST', body: '{"ids":[1],"bookmarked":true}' }],
      ['/api/v1/items/mark_all_read', { method: 'POST', body: '{"stream":"unread","before":0}' }],
      ['/api/v1/feeds', { method: 'POST', body: '{"url":"https://c.example/feed.xml"}' }],
      ['/api/v1/feeds/discover', { method: 'POST', body: '{"url":"https://c.example/"}' }],
      ['/api/v1/feeds/refresh_all', { method: 'POST' }],
      ['/api/v1/feeds/1/refresh', { method: 'POST' }],
      ['/api/v1/opml/import', { method: 'POST', body: '{"xml":"<opml/>"}' }],
      ['/api/v1/settings', { method: 'PATCH', body: '{"theme":"dark"}' }],
      ['/api/v1/tokens', { method: 'POST', body: '{"name":"x"}' }],
    ]
    for (const [path, init] of writes) {
      const res = await call(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      })
      expect(res.status, path).toBe(404)
    }
    for (const path of [
      '/api/v1/storage',
      '/api/v1/credentials',
      '/api/v1/sessions',
      '/api/v1/opml/export',
      '/reader/api/0/user-info',
      '/greader/reader/api/0/user-info',
      '/accounts/ClientLogin',
      '/auth/register/options',
    ]) {
      expect((await call(path)).status, path).toBe(404)
    }
  })

  it('serves proxied images but not the icon lookup that would read the database', async () => {
    restore = stubFetch()
    const body = await (await call('/api/v1/bootstrap')).json<{ feeds: { icon_url: string }[] }>()
    const iconUrl = body.feeds[0]?.icon_url ?? ''
    expect((await call(iconUrl.slice(ORIGIN.length))).status).toBe(200)
    expect((await call('/img?i=1&s=whatever')).status).toBe(404)
  })

  it('sends the login page back to the reader', async () => {
    const res = await call('/login')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
  })

  it('extracts the full content once and serves it from the cache after that', async () => {
    restore = stubFetch()
    const list = await (await call('/api/v1/items?stream=all')).json<{ items: { id: number }[] }>()
    const id = list.items[0]?.id ?? 0

    const res = await call(`/api/v1/items/${id}/full_content`, {
      method: 'POST',
      headers: { Origin: ORIGIN },
    })
    expect(res.status).toBe(200)
    const extracted = await res.json<{ html: string }>()
    expect(extracted.html).toContain('記事ページだけにある本文')
    expect(extracted.html).toContain('/img?u=')

    const detail = await (await call(`/api/v1/items/${id}`)).json<{
      has_full_content: boolean
      full_content_html: string | null
    }>()
    expect(detail.has_full_content).toBe(true)
    expect(detail.full_content_html).toContain('記事ページだけにある本文')

    restore?.()
    restore = undefined
    const cached = await call(`/api/v1/items/${id}/full_content`, {
      method: 'POST',
      headers: { Origin: ORIGIN },
    })
    expect(cached.status).toBe(200)
    expect((await cached.json<{ html: string }>()).html).toContain('記事ページだけにある本文')
  })

  it('refuses a full content request from another origin, and 404s an unknown article', async () => {
    restore = stubFetch()
    const crossOrigin = await call('/api/v1/items/1/full_content', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    })
    expect(crossOrigin.status).toBe(403)
    const unknown = await call('/api/v1/items/999999/full_content', {
      method: 'POST',
      headers: { Origin: ORIGIN },
    })
    expect(unknown.status).toBe(404)
  })
})
