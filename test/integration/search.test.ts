import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { listItems } from '../../src/server/db/queries/items.ts'

/** `after:`や`before:`が境界として意味を持つよう、2件を別の月に置く */
const NEWER = Date.UTC(2026, 2, 1) / 1000
const OLDER = Date.UTC(2026, 0, 1) / 1000
const OLDEST = Date.UTC(2025, 0, 1) / 1000

async function seed(suffix: string): Promise<number> {
  const feed = await env.DB.prepare(
    'INSERT INTO feeds (feed_url, title, next_fetch_at, created_at) VALUES (?, ?, 1, 1)',
  )
    .bind(`https://example.com/search-${suffix}.xml`, 'Search Feed')
    .run()
  const feedId = feed.meta.last_row_id
  const tagId = Number(feedId) + 1000
  await env.DB.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, 1)')
    .bind(tagId, `ブログ-${suffix}`)
    .run()
  await env.DB.prepare('INSERT INTO feed_tags (feed_id, tag_id) VALUES (?, ?)')
    .bind(feedId, tagId)
    .run()
  await env.DB.prepare(
    `INSERT INTO items (feed_id, guid_hash, title, summary, published_at, crawled_at, content_hash, is_read, is_starred)
     VALUES (?, 'a', '未読の記事', 'りんごジュース', ?, ?, 'h1', 0, 0)`,
  )
    .bind(feedId, NEWER, NEWER)
    .run()
  await env.DB.prepare(
    `INSERT INTO items (feed_id, guid_hash, title, summary, published_at, crawled_at, content_hash, is_read, is_starred)
     VALUES (?, 'b', '既読の記事', 'みかん', ?, ?, 'h2', 1, 1)`,
  )
    .bind(feedId, OLDER, OLDER)
    .run()
  return feedId
}

describe('search', () => {
  it('filters with Feedbin-style syntax', async () => {
    const feedId = await seed('a')
    const unread = await listItems(env.DB, {
      stream: 'all',
      q: 'is:unread',
      order: 'desc',
      limit: 50,
    })
    expect(unread.items.map((item) => item.title)).toEqual(['未読の記事'])

    const bookmarked = await listItems(env.DB, {
      stream: 'all',
      q: 'is:bookmarked',
      order: 'desc',
      limit: 50,
    })
    expect(bookmarked.items.map((item) => item.title)).toEqual(['既読の記事'])

    const byFeed = await listItems(env.DB, {
      stream: 'all',
      q: `feed:${feedId}`,
      order: 'desc',
      limit: 50,
    })
    expect(byFeed.items).toHaveLength(2)

    const byTag = await listItems(env.DB, {
      stream: 'all',
      q: 'tag:ブログ-a',
      order: 'desc',
      limit: 50,
    })
    expect(byTag.items).toHaveLength(2)

    const after = await listItems(env.DB, {
      stream: 'all',
      q: 'after:2026-02-01',
      order: 'desc',
      limit: 50,
    })
    expect(after.items.map((item) => item.title)).toEqual(['未読の記事'])

    const before = await listItems(env.DB, {
      stream: 'all',
      q: 'before:2026-02-01',
      order: 'desc',
      limit: 50,
    })
    expect(before.items.map((item) => item.title)).toEqual(['既読の記事'])

    const phrase = await listItems(env.DB, {
      stream: 'all',
      q: '"未読の記事"',
      order: 'desc',
      limit: 50,
    })
    expect(phrase.items.map((item) => item.title)).toEqual(['未読の記事'])

    const isRead = await listItems(env.DB, {
      stream: 'all',
      q: 'is:read',
      order: 'desc',
      limit: 50,
    })
    expect(isRead.items.map((item) => item.title)).toEqual(['既読の記事'])
  })

  it('uses LIKE for 2 characters and MATCH for 3+', async () => {
    const feedId = await seed('b')
    await env.DB.prepare(
      `INSERT INTO items (feed_id, guid_hash, title, summary, published_at, crawled_at, content_hash, is_read, is_starred)
       VALUES (?, 'c', 'Apple pie notes', 'zz', ?, ?, 'h3', 0, 0)`,
    )
      .bind(feedId, OLDEST, OLDEST)
      .run()
    const like = await listItems(env.DB, {
      stream: 'all',
      q: 'Ap',
      order: 'desc',
      limit: 50,
    })
    expect(like.items.some((item) => item.title === 'Apple pie notes')).toBe(true)

    const match = await listItems(env.DB, {
      stream: 'all',
      q: 'Apple',
      order: 'desc',
      limit: 50,
    })
    expect(match.items.some((item) => item.title === 'Apple pie notes')).toBe(true)
  })
})
