import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { ORIGIN, sessionCookie } from '../helpers.ts'

async function seedFeed(suffix: string): Promise<number> {
  const feed = await env.DB.prepare(
    'INSERT INTO feeds (feed_url, title, next_fetch_at, created_at) VALUES (?, ?, 1, 1)',
  )
    .bind(`https://example.com/storage-${suffix}.xml`, 'Storage')
    .run()
  const feedId = feed.meta.last_row_id
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO items (feed_id, guid_hash, title, published_at, crawled_at, content_hash, is_read, is_starred)
       VALUES (?, 'plain', '普通', 1, 1, 'h', 1, 0)`,
    ).bind(feedId),
    env.DB.prepare(
      `INSERT INTO items (feed_id, guid_hash, title, published_at, crawled_at, content_hash, is_read, is_starred)
       VALUES (?, 'star', 'スター', 1, 1, 'h', 1, 1)`,
    ).bind(feedId),
  ])
  return feedId
}

async function titlesOf(feedId: number): Promise<string[]> {
  const rows = await env.DB.prepare('SELECT title FROM items WHERE feed_id = ? ORDER BY id')
    .bind(feedId)
    .all<{ title: string }>()
  return rows.results.map((row) => row.title)
}

describe('storage deletion', () => {
  it('keeps bookmarked items when deleting a feed’s stored articles', async () => {
    const feedId = await seedFeed('keep')
    const res = await SELF.fetch(`${ORIGIN}/api/v1/feeds/${feedId}/items`, {
      method: 'DELETE',
      headers: { Origin: ORIGIN, Cookie: await sessionCookie() },
    })
    expect(res.status).toBe(200)
    expect(await titlesOf(feedId)).toEqual(['スター'])
    const purged = await env.DB.prepare('SELECT guid_hash FROM purged_items WHERE feed_id = ?')
      .bind(feedId)
      .all<{ guid_hash: string }>()
    expect(purged.results.map((row) => row.guid_hash)).toEqual(['plain'])
  })

  it('deletes bookmarked items too when asked to include them', async () => {
    const feedId = await seedFeed('include')
    const res = await SELF.fetch(`${ORIGIN}/api/v1/feeds/${feedId}/items?include_bookmarked=1`, {
      method: 'DELETE',
      headers: { Origin: ORIGIN, Cookie: await sessionCookie() },
    })
    expect(res.status).toBe(200)
    expect(await titlesOf(feedId)).toEqual([])
  })
})
