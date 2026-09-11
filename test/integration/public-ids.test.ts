import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { insertFeed } from '../../src/server/db/queries/feeds.ts'
import { backfillPublicIds } from '../../src/server/jobs.ts'
import { sha256Hex } from '../../src/server/lib/crypto.ts'
import { ingestFeed } from '../../src/server/services/ingest.ts'
import { ORIGIN, sessionCookie } from '../helpers.ts'

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>P</title><link>https://example.com/</link>
<item><title>One</title><guid>p-1</guid><pubDate>Mon, 01 Sep 2026 00:00:00 GMT</pubDate>
<description>hi</description></item></channel></rss>`

function headers(cookie: string): HeadersInit {
  return {
    Origin: ORIGIN,
    Cookie: cookie,
    'Content-Type': 'application/json',
  }
}

describe('public IDs', () => {
  it('resolves the same item by public id and numeric id, and reorders feeds and tags', async () => {
    const cookie = await sessionCookie()
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('user_handle', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    )
      .bind(JSON.stringify('00000000-0000-4000-8000-000000000000'))
      .run()
    const original = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(RSS, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } })
    try {
      const first = await insertFeed(env.DB, {
        url: 'https://example.com/a.xml',
        title: 'A',
      })
      const second = await insertFeed(env.DB, {
        url: 'https://example.com/b.xml',
        title: 'B',
      })
      await ingestFeed(env, first, { force: true, now: 1_756_857_600 })

      const item = await env.DB.prepare('SELECT id, public_id FROM items WHERE feed_id = ?')
        .bind(first)
        .first<{ id: number; public_id: string }>()

      const byNumber = await SELF.fetch(`${ORIGIN}/api/v1/items/${item?.id}`, {
        headers: headers(cookie),
      })
      const byPublic = await SELF.fetch(`${ORIGIN}/api/v1/items/${item?.public_id}`, {
        headers: headers(cookie),
      })
      expect(byNumber.status).toBe(200)
      expect(byPublic.status).toBe(200)
      expect(await byPublic.json()).toEqual(await byNumber.json())

      const created = await SELF.fetch(`${ORIGIN}/api/v1/tags`, {
        method: 'POST',
        headers: headers(cookie),
        body: JSON.stringify({ name: '仕事' }),
      })
      expect(created.status).toBe(201)
      const tag = (await created.json()) as { id: number; public_id: string }

      const extraTag = await SELF.fetch(`${ORIGIN}/api/v1/tags`, {
        method: 'POST',
        headers: headers(cookie),
        body: JSON.stringify({ name: '趣味' }),
      })
      const extra = (await extraTag.json()) as { id: number }

      const feedOrder = await SELF.fetch(`${ORIGIN}/api/v1/feeds/order`, {
        method: 'POST',
        headers: headers(cookie),
        body: JSON.stringify({ ids: [second, first] }),
      })
      expect(feedOrder.status).toBe(200)
      const feeds = await env.DB.prepare('SELECT id FROM feeds ORDER BY sort_index, id').all<{
        id: number
      }>()
      expect(feeds.results.map((row) => row.id)).toEqual([second, first])

      const tagOrder = await SELF.fetch(`${ORIGIN}/api/v1/tags/order`, {
        method: 'POST',
        headers: headers(cookie),
        body: JSON.stringify({ ids: [extra.id, tag.id] }),
      })
      expect(tagOrder.status).toBe(200)
      const tags = await env.DB.prepare('SELECT id FROM tags ORDER BY sort_index, id').all<{
        id: number
      }>()
      expect(tags.results.map((row) => row.id)).toEqual([extra.id, tag.id])

      const bootstrap = await SELF.fetch(`${ORIGIN}/api/v1/bootstrap`, {
        headers: headers(cookie),
      })
      expect(bootstrap.status).toBe(200)
      const body = (await bootstrap.json()) as {
        feeds: { public_id: string }[]
        tags: { public_id: string }[]
      }
      expect(body.feeds.every((feed) => typeof feed.public_id === 'string')).toBe(true)
      expect(body.tags.every((row) => typeof row.public_id === 'string')).toBe(true)

      const itemsRes = await SELF.fetch(`${ORIGIN}/api/v1/items?stream=all`, {
        headers: headers(cookie),
      })
      const itemsBody = (await itemsRes.json()) as { items: { public_id: string }[] }
      expect(itemsBody.items.some((row) => typeof row.public_id === 'string')).toBe(true)
    } finally {
      globalThis.fetch = original
    }
  })

  it('backfills existing rows in feed, tag, then item order', async () => {
    await env.DB.prepare(
      `INSERT INTO feeds (feed_url, title, next_fetch_at, created_at)
       VALUES (?, 'old', 1, 1)`,
    )
      .bind(`https://example.com/old-${sha256Hex('x')}.xml`)
      .run()
    const feed = await env.DB.prepare(
      'SELECT id FROM feeds WHERE public_id IS NULL ORDER BY id DESC LIMIT 1',
    ).first<{ id: number }>()
    expect(feed).not.toBeNull()
    await env.DB.prepare('INSERT INTO tags (name, created_at) VALUES (?, 1)').bind('旧タグ').run()
    await env.DB.prepare(
      `INSERT INTO items (feed_id, guid_hash, title, published_at, crawled_at, content_hash)
       VALUES (?, ?, 'old item', 1, 1, 'hash')`,
    )
      .bind(feed?.id, sha256Hex('old-guid'))
      .run()

    await backfillPublicIds(env.DB)

    const leftover = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM feeds WHERE public_id IS NULL) AS feeds,
         (SELECT COUNT(*) FROM tags WHERE public_id IS NULL) AS tags,
         (SELECT COUNT(*) FROM items WHERE public_id IS NULL) AS items`,
    ).first<{ feeds: number; tags: number; items: number }>()
    expect(leftover).toEqual({ feeds: 0, tags: 0, items: 0 })
  })
})
