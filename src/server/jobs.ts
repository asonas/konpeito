import { z } from 'zod'
import { listDueFeeds, recomputeFeedStats } from './db/queries/feeds.ts'
import { nowSec } from './lib/crypto.ts'
import { mapWithConcurrency } from './lib/pool.ts'
import { allocatePublicId, feedPublicId, itemPublicId, tagPublicId } from './lib/public-id.ts'
import { hostOf } from './lib/url.ts'
import { fetchFeedIcon } from './services/icon.ts'
import { ingestFeed } from './services/ingest.ts'
import { queueRetryDelaySec } from './services/scheduler.ts'
import type { FeedFetchMessage } from './types.ts'

const THIRTY_DAYS = 30 * 24 * 60 * 60

const feedFetchMessageSchema = z.object({
  feedId: z.number().int().positive(),
  reason: z.enum(['scheduled', 'manual', 'subscribe']),
  enqueuedAt: z.number().int(),
})

const BACKFILL_LIMIT = 500

async function backfillTable<T>(
  db: D1Database,
  table: 'feeds' | 'tags' | 'items',
  select: string,
  generate: (row: T, attempt: number) => string,
): Promise<void> {
  const rows = await db.prepare(select).bind(BACKFILL_LIMIT).all<T & { id: number }>()
  if (rows.results.length === 0) {
    return
  }
  const used = new Set<string>()
  await db.batch(
    rows.results.map((row) =>
      db.prepare(`UPDATE ${table} SET public_id = ? WHERE id = ? AND public_id IS NULL`).bind(
        allocatePublicId((attempt) => generate(row, attempt), used),
        row.id,
      ),
    ),
  )
}

export async function backfillPublicIds(db: D1Database): Promise<void> {
  await backfillTable<{ feed_url: string }>(
    db,
    'feeds',
    'SELECT id, feed_url FROM feeds WHERE public_id IS NULL ORDER BY id LIMIT ?',
    (row, attempt) => feedPublicId(row.feed_url, attempt),
  )
  await backfillTable<{ name: string; created_at: number }>(
    db,
    'tags',
    'SELECT id, name, created_at FROM tags WHERE public_id IS NULL ORDER BY id LIMIT ?',
    (row, attempt) => tagPublicId(row.name, row.created_at, attempt),
  )
  // フィードの公開IDから作るので、フィードを埋めたあとに走らせる
  await backfillTable<{ guid_hash: string; feed_public_id: string }>(
    db,
    'items',
    `SELECT items.id, items.guid_hash, feeds.public_id AS feed_public_id
       FROM items
       JOIN feeds ON feeds.id = items.feed_id
       WHERE items.public_id IS NULL AND feeds.public_id IS NOT NULL
       ORDER BY items.id
       LIMIT ?`,
    (row, attempt) => itemPublicId(row.feed_public_id, row.guid_hash, attempt),
  )
}

export async function dispatchDueFeeds(env: Env, now: number): Promise<number> {
  const due = await listDueFeeds(env.DB, now, 200)
  if (due.length === 0) {
    return 0
  }
  const messages = due.map((feed) => ({
    body: {
      feedId: feed.id,
      reason: 'scheduled' as const,
      enqueuedAt: now,
    },
  }))
  await env.FEED_QUEUE.sendBatch(messages)
  const statements = due.map((feed) =>
    env.DB.prepare('UPDATE feeds SET next_fetch_at = ? WHERE id = ?').bind(
      now + feed.fetch_interval_sec,
      feed.id,
    ),
  )
  await env.DB.batch(statements)
  console.log({ event: 'queue.dispatch', count: due.length })
  return due.length
}

export async function runDailyMaintenance(env: Env, now: number): Promise<void> {
  await recomputeFeedStats(env.DB)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM webauthn_challenges WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM host_throttle WHERE retry_after <= ?').bind(now),
    env.DB.prepare(
      `UPDATE feeds SET disabled = 1, disabled_reason = '30_day_failure'
       WHERE disabled = 0 AND error_count > 0 AND COALESCE(last_success_at, created_at) < ?`,
    ).bind(now - THIRTY_DAYS),
    env.DB.prepare(`INSERT INTO items_fts(items_fts) VALUES('optimize')`),
  ])
  const stale = await env.DB.prepare(
    `SELECT id, site_url, feed_url FROM feeds
     WHERE disabled = 0 AND (icon_fetched_at IS NULL OR icon_fetched_at < ?)`,
  )
    .bind(now - THIRTY_DAYS)
    .all<{ id: number; site_url: string | null; feed_url: string }>()
  const iconStatements: D1PreparedStatement[] = []
  for (const feed of stale.results) {
    const icon = await fetchFeedIcon(
      { siteUrl: feed.site_url, feedUrl: feed.feed_url },
      { fetch, now: () => now },
    )
    if (icon) {
      iconStatements.push(
        env.DB.prepare(
          'UPDATE feeds SET icon = ?, icon_mime = ?, icon_url = ?, icon_fetched_at = ? WHERE id = ?',
        ).bind(icon.bytes, icon.mime, icon.sourceUrl, now, feed.id),
      )
    } else {
      iconStatements.push(
        env.DB.prepare('UPDATE feeds SET icon_fetched_at = ? WHERE id = ?').bind(now, feed.id),
      )
    }
  }
  if (iconStatements.length > 0) {
    await env.DB.batch(iconStatements)
  }
  console.log({ event: 'maintenance.run', at: now })
}

type FeedLookup = {
  id: number
  feed_url: string
  next_fetch_at: number
  last_fetch_at: number | null
}

export async function handleFeedQueue(
  batch: MessageBatch<FeedFetchMessage>,
  env: Env,
): Promise<void> {
  const groups = new Map<string, Message<FeedFetchMessage>[]>()
  for (const message of batch.messages) {
    const parsed = feedFetchMessageSchema.safeParse(message.body)
    if (!parsed.success) {
      message.ack()
      continue
    }
    const feed = await env.DB.prepare(
      'SELECT id, feed_url, next_fetch_at, last_fetch_at FROM feeds WHERE id = ?',
    )
      .bind(parsed.data.feedId)
      .first<FeedLookup>()
    const host = feed ? (hostOf(feed.feed_url) ?? '') : `id:${parsed.data.feedId}`
    const list = groups.get(host) ?? []
    list.push(message)
    groups.set(host, list)
  }
  await mapWithConcurrency([...groups.values()], 4, async (messages) => {
    for (const message of messages) {
      await processMessage(message, env)
    }
  })
}

async function processMessage(message: Message<FeedFetchMessage>, env: Env): Promise<void> {
  const parsed = feedFetchMessageSchema.safeParse(message.body)
  if (!parsed.success) {
    message.ack()
    return
  }
  const { feedId, reason, enqueuedAt } = parsed.data
  const now = nowSec()
  const feed = await env.DB.prepare(
    'SELECT id, next_fetch_at, last_fetch_at FROM feeds WHERE id = ?',
  )
    .bind(feedId)
    .first<{ id: number; next_fetch_at: number; last_fetch_at: number | null }>()
  if (!feed) {
    message.ack()
    return
  }
  if (
    reason === 'scheduled' &&
    feed.next_fetch_at > now &&
    feed.last_fetch_at !== null &&
    feed.last_fetch_at >= enqueuedAt
  ) {
    message.ack()
    return
  }
  try {
    const result = await ingestFeed(env, feedId, {
      force: reason === 'manual' || reason === 'subscribe',
      now,
    })
    console.log({
      event: result.outcome === 'error' ? 'feed.error' : 'feed.fetch',
      feed_id: result.feedId,
      status: result.outcome,
      rows_read: result.rowsRead,
      duration_ms: result.durationMs,
    })
    if (result.outcome === 'error' && result.errorKind) {
      const delay = queueRetryDelaySec(result.errorKind, message.attempts)
      if (delay !== null) {
        message.retry({ delaySeconds: delay })
        return
      }
    }
    message.ack()
  } catch (error) {
    console.log({
      event: 'feed.error',
      feed_id: feedId,
      status: 'exception',
      message: error instanceof Error ? error.message : 'error',
    })
    const delay = queueRetryDelaySec('network', message.attempts)
    if (delay !== null) {
      message.retry({ delaySeconds: delay })
      return
    }
    message.ack()
  }
}
