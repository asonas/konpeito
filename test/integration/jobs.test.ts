import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { dispatchDueFeeds, handleFeedQueue } from '../../src/server/jobs.ts'
import type { FeedFetchMessage } from '../../src/server/types.ts'

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Q</title><link>https://example.com/</link>
<item><title>Hello</title><guid>q-1</guid><pubDate>Mon, 01 Sep 2026 00:00:00 GMT</pubDate>
<description>hi</description></item></channel></rss>`

function message(
  body: FeedFetchMessage,
  hooks: { ack: () => void; retry: () => void },
): Message<FeedFetchMessage> {
  return {
    id: `msg-${body.feedId}`,
    timestamp: new Date(),
    body,
    attempts: 1,
    ack: hooks.ack,
    retry: hooks.retry,
  }
}

describe('cron and queue', () => {
  it('dispatches only due feeds and the consumer finishes ingest', async () => {
    const now = 1_000
    await env.DB.prepare(
      `INSERT INTO feeds (id, feed_url, title, next_fetch_at, created_at)
       VALUES (501, ?, 'due', 10, 1), (502, ?, 'later', 5000, 1)`,
    )
      .bind('https://example.com/due.xml', 'https://example.com/later.xml')
      .run()
    const sent: FeedFetchMessage[] = []
    const originalSend = env.FEED_QUEUE.sendBatch.bind(env.FEED_QUEUE)
    env.FEED_QUEUE.sendBatch = async (batch) => {
      for (const entry of batch) {
        sent.push(entry.body as FeedFetchMessage)
      }
      return { metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } }
    }
    try {
      const count = await dispatchDueFeeds(env, now)
      expect(count).toBe(1)
      expect(sent).toEqual([{ feedId: 501, reason: 'scheduled', enqueuedAt: now }])
    } finally {
      env.FEED_QUEUE.sendBatch = originalSend
    }

    const original = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(RSS, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } })
    let acked = false
    let retried = false
    try {
      await handleFeedQueue(
        {
          queue: 'feed-fetch',
          metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
          messages: [
            message(
              { feedId: 501, reason: 'scheduled', enqueuedAt: now },
              {
                ack: () => {
                  acked = true
                },
                retry: () => {
                  retried = true
                },
              },
            ),
          ],
          ackAll() {},
          retryAll() {},
        },
        env,
      )
      expect(acked).toBe(true)
      expect(retried).toBe(false)
      const items = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM items WHERE feed_id = 501',
      ).first<{
        n: number
      }>()
      expect(items?.n).toBe(1)
    } finally {
      globalThis.fetch = original
    }
  })

  it('retries only transient queue errors', async () => {
    await env.DB.prepare(
      `INSERT INTO feeds (id, feed_url, title, next_fetch_at, created_at)
       VALUES (601, ?, 't', 1, 1), (602, ?, 'g', 1, 1)`,
    )
      .bind('https://example.com/5xx.xml', 'https://example.com/gone-q.xml')
      .run()
    const original = globalThis.fetch
    try {
      globalThis.fetch = async (input) => {
        const url =
          typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
        if (url.includes('5xx')) {
          return new Response('', { status: 502 })
        }
        return new Response('', { status: 410 })
      }
      let transientRetry = false
      let goneRetry = false
      await handleFeedQueue(
        {
          queue: 'feed-fetch',
          metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
          messages: [
            message(
              { feedId: 601, reason: 'scheduled', enqueuedAt: 1 },
              {
                ack: () => {},
                retry: () => {
                  transientRetry = true
                },
              },
            ),
            message(
              { feedId: 602, reason: 'scheduled', enqueuedAt: 1 },
              {
                ack: () => {},
                retry: () => {
                  goneRetry = true
                },
              },
            ),
          ],
          ackAll() {},
          retryAll() {},
        },
        env,
      )
      expect(transientRetry).toBe(true)
      expect(goneRetry).toBe(false)
    } finally {
      globalThis.fetch = original
    }
  })
})
