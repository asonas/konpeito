import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { buildItemListSql } from '../../src/server/db/queries/items.ts'
import type { Stream } from '../../src/shared/schemas.ts'

describe('item list rows_read', () => {
  it('stays at most twice the limit except tag filters', async () => {
    const feed = await env.DB.prepare(
      'INSERT INTO feeds (feed_url, title, next_fetch_at, created_at) VALUES (?, ?, 1, 1)',
    )
      .bind('https://example.com/rows.xml', 'Rows')
      .run()
    const feedId = feed.meta.last_row_id
    const statements: D1PreparedStatement[] = []
    for (let i = 0; i < 120; i += 1) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO items (feed_id, guid_hash, title, published_at, crawled_at, content_hash, is_read)
           VALUES (?, ?, ?, ?, 1, 'h', 0)`,
        ).bind(feedId, `g-${i}`, `記事 ${i}`, 1000 + i),
      )
    }
    await env.DB.batch(statements)
    const streams: Stream[] = ['unread', 'all']
    for (const stream of streams) {
      const query = buildItemListSql({ stream, order: 'desc', limit: 50 })
      const result = await env.DB.prepare(query.sql)
        .bind(...query.binds)
        .all()
      expect(result.meta.rows_read, stream).toBeLessThanOrEqual(100)
    }
    const byFeed = buildItemListSql({ stream: 'unread', feedId, order: 'desc', limit: 50 })
    const feedResult = await env.DB.prepare(byFeed.sql)
      .bind(...byFeed.binds)
      .all()
    expect(feedResult.meta.rows_read).toBeLessThanOrEqual(100)
  })

  /**
   * `buildItemListSql`は11.3のインデックスを`INDEXED BY`で名指しする。
   * 名指ししたインデックスが無い、または問い合わせに使えない形になっていれば
   * SQLiteはここで失敗するので、全ストリームと絞り込みを一度ずつ実行して確かめる。
   */
  it('runs every stream and filter against the index it names', async () => {
    const streams: Stream[] = ['unread', 'all', 'bookmarked', 'recently_read', 'updated']
    for (const stream of streams) {
      const filters: { feedId?: number; tagId?: number }[] = [{}, { feedId: 1 }, { tagId: 1 }]
      for (const filter of filters) {
        const query = buildItemListSql({ stream, ...filter, order: 'desc', limit: 50 })
        const label = `${stream} ${JSON.stringify(filter)}`
        await expect(
          env.DB.prepare(query.sql)
            .bind(...query.binds)
            .all(),
          label,
        ).resolves.toBeDefined()
      }
    }
  })
})
