import { isRecord } from '../../../shared/records.ts'
import { nowSec } from '../../lib/crypto.ts'
import { feedPublicId, insertWithPublicId } from '../../lib/public-id.ts'

export type FeedRow = {
  id: number
  feed_url: string
  effective_url: string | null
  site_url: string | null
  title: string
  custom_title: string | null
  description: string | null
  language: string | null
  fetch_full_content: number
  show_lead_image: number
  keep_hash_in_url: number
  sort_index: number
  disabled: number
  disabled_reason: string | null
  last_error_kind: string | null
  last_error: string | null
  error_count: number
  last_fetch_at: number | null
  last_success_at: number | null
  next_fetch_at: number
  icon_mime: string | null
  unread_count: number
  total_count: number
  public_id: string | null
}

type FeedListItem = FeedRow & {
  tags: { id: number; name: string }[]
}

type DueFeed = {
  id: number
  feed_url: string
  fetch_interval_sec: number
  next_fetch_at: number
}

const FEED_SELECT = `SELECT feeds.id, feeds.feed_url, feeds.effective_url, feeds.site_url, feeds.title,
              feeds.custom_title, feeds.description, feeds.language,
              feeds.fetch_full_content, feeds.show_lead_image, feeds.keep_hash_in_url,
              feeds.sort_index, feeds.disabled, feeds.disabled_reason, feeds.last_error_kind,
              feeds.last_error, feeds.error_count, feeds.last_fetch_at, feeds.last_success_at,
              feeds.next_fetch_at, feeds.icon_mime, feeds.public_id,
              COALESCE(feed_counters.unread_count, 0) AS unread_count,
              COALESCE(feed_counters.total_count, 0) AS total_count
       FROM feeds
       LEFT JOIN feed_counters ON feed_counters.feed_id = feeds.id`

const FEED_LIST_SQL = `${FEED_SELECT}
       ORDER BY feeds.sort_index, feeds.id`

const FEED_TAGS_SQL = `SELECT feed_tags.feed_id, tags.id, tags.name
       FROM feed_tags JOIN tags ON tags.id = feed_tags.tag_id
       ORDER BY tags.sort_index, tags.name`

type FeedTagRow = { feed_id: number; id: number; name: string }

function isFeedRow(value: unknown): value is FeedRow {
  return isRecord(value) && typeof value.id === 'number' && typeof value.feed_url === 'string'
}

function isFeedTagRow(value: unknown): value is FeedTagRow {
  return (
    isRecord(value) &&
    typeof value.feed_id === 'number' &&
    typeof value.id === 'number' &&
    typeof value.name === 'string'
  )
}

export function feedListStatements(db: D1Database): [D1PreparedStatement, D1PreparedStatement] {
  return [db.prepare(FEED_LIST_SQL), db.prepare(FEED_TAGS_SQL)]
}

export function assembleFeedList(feedRows: unknown[], tagRows: unknown[]): FeedListItem[] {
  const byFeed = new Map<number, { id: number; name: string }[]>()
  for (const row of tagRows) {
    if (!isFeedTagRow(row)) {
      continue
    }
    const list = byFeed.get(row.feed_id) ?? []
    list.push({ id: row.id, name: row.name })
    byFeed.set(row.feed_id, list)
  }
  return feedRows.filter(isFeedRow).map((feed) => ({
    ...feed,
    tags: byFeed.get(feed.id) ?? [],
  }))
}

export async function listFeeds(db: D1Database): Promise<FeedListItem[]> {
  const [feeds, tags] = await db.batch(feedListStatements(db))
  return assembleFeedList(feeds?.results ?? [], tags?.results ?? [])
}

export async function getFeed(db: D1Database, id: number): Promise<FeedRow | null> {
  return db.prepare(`${FEED_SELECT} WHERE feeds.id = ?`).bind(id).first<FeedRow>()
}

export async function insertFeed(
  db: D1Database,
  input: { url: string; title: string; tagIds?: number[] },
): Promise<number> {
  const now = nowSec()
  return insertWithPublicId(
    (attempt) => feedPublicId(input.url, attempt),
    async (publicId) => {
      const result = await db
        .prepare(
          `INSERT INTO feeds (feed_url, title, next_fetch_at, created_at, public_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(input.url, input.title, now, now, publicId)
        .run()
      const id = result.meta.last_row_id
      const statements: D1PreparedStatement[] = [
        db
          .prepare(
            'INSERT OR IGNORE INTO feed_counters (feed_id, unread_count, total_count) VALUES (?, 0, 0)',
          )
          .bind(id),
      ]
      if (input.tagIds) {
        for (const tagId of input.tagIds) {
          statements.push(
            db
              .prepare('INSERT OR IGNORE INTO feed_tags (feed_id, tag_id) VALUES (?, ?)')
              .bind(id, tagId),
          )
        }
      }
      await db.batch(statements)
      return id
    },
  )
}

export async function reorderByIds(
  db: D1Database,
  table: 'feeds' | 'tags',
  ids: number[],
): Promise<void> {
  const listed = new Set(ids)
  const remaining = await db
    .prepare(`SELECT id FROM ${table} ORDER BY sort_index, id`)
    .all<{ id: number }>()
  const ordered = [
    ...ids,
    ...remaining.results.map((row) => row.id).filter((id) => !listed.has(id)),
  ]
  if (ordered.length === 0) {
    return
  }
  const statements = ordered.map((id, index) =>
    db.prepare(`UPDATE ${table} SET sort_index = ? WHERE id = ?`).bind(index, id),
  )
  await db.batch(statements)
}

export async function replaceFeedTags(
  db: D1Database,
  feedId: number,
  tagIds: number[],
): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM feed_tags WHERE feed_id = ?').bind(feedId),
  ]
  for (const tagId of tagIds) {
    statements.push(
      db.prepare('INSERT INTO feed_tags (feed_id, tag_id) VALUES (?, ?)').bind(feedId, tagId),
    )
  }
  await db.batch(statements)
}

export async function listDueFeeds(db: D1Database, now: number, limit: number): Promise<DueFeed[]> {
  const rows = await db
    .prepare(
      `SELECT id, feed_url, fetch_interval_sec, next_fetch_at
       FROM feeds
       WHERE disabled = 0 AND next_fetch_at <= ?
       ORDER BY next_fetch_at
       LIMIT ?`,
    )
    .bind(now, limit)
    .all<DueFeed>()
  const throttled = await db
    .prepare('SELECT host, retry_after FROM host_throttle WHERE retry_after > ?')
    .bind(now)
    .all<{ host: string; retry_after: number }>()
  const blocked = new Set(throttled.results.map((row) => row.host.toLowerCase()))
  return rows.results.filter((feed) => {
    try {
      const host = new URL(feed.feed_url).hostname.toLowerCase()
      return !blocked.has(host)
    } catch {
      return true
    }
  })
}

export async function listHealthFeeds(db: D1Database) {
  return db
    .prepare(
      `SELECT id, title, custom_title, feed_url, last_error_kind, last_error, error_count,
              last_fetch_at, last_success_at, disabled, disabled_reason
       FROM feeds
       WHERE last_error_kind IS NOT NULL OR disabled = 1
       ORDER BY disabled DESC, error_count DESC, id`,
    )
    .all<{
      id: number
      title: string
      custom_title: string | null
      feed_url: string
      last_error_kind: string | null
      last_error: string | null
      error_count: number
      last_fetch_at: number | null
      last_success_at: number | null
      disabled: number
      disabled_reason: string | null
    }>()
}

export async function listStorageStats(db: D1Database) {
  return db
    .prepare(
      `SELECT feed_stats.feed_id, feeds.title, feeds.custom_title, feed_stats.item_count,
              feed_stats.approx_bytes, feed_stats.oldest_published_at, feed_stats.computed_at
       FROM feed_stats
       JOIN feeds ON feeds.id = feed_stats.feed_id
       ORDER BY feed_stats.approx_bytes DESC`,
    )
    .all<{
      feed_id: number
      title: string
      custom_title: string | null
      item_count: number
      approx_bytes: number
      oldest_published_at: number | null
      computed_at: number
    }>()
}

export async function recomputeFeedStats(db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO feed_stats (feed_id, item_count, approx_bytes, oldest_published_at, computed_at)
       SELECT feed_id,
              COUNT(*),
              SUM(LENGTH(COALESCE(content_html, ''))
                + LENGTH(COALESCE(full_content_html, ''))
                + LENGTH(COALESCE(original_content_html, ''))
                + LENGTH(COALESCE(summary, ''))),
              MIN(published_at),
              unixepoch()
       FROM items
       GROUP BY feed_id`,
    )
    .run()
}
