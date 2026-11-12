import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { scorePendingItems } from '../../src/server/services/recommendation/jobs.ts'
import { withFetch } from '../helpers.ts'

const NOW = 1_800_000_000
const DAY = 24 * 60 * 60

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM feeds WHERE id = 701'),
    env.DB.prepare('DELETE FROM preference_versions'),
  ])
})

async function seedFeed(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO feeds (id, feed_url, title, next_fetch_at, created_at)
     VALUES (701, 'https://example.com/rec.xml', 'Rec Feed', 0, 1)`,
  ).run()
}

async function seedItem(
  id: number,
  options: { read?: boolean; publishedAt?: number } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO items (id, feed_id, guid_hash, title, summary, published_at, crawled_at, content_hash, is_read)
     VALUES (?, 701, ?, ?, 'summary', ?, ?, 'h', ?)`,
  )
    .bind(
      id,
      `g-${id}`,
      `Item ${id}`,
      options.publishedAt ?? NOW - 60,
      NOW - 60,
      options.read ? 1 : 0,
    )
    .run()
}

async function seedActiveVersion(id = 1, body = 'I like Ruby'): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO preference_versions (id, body, source, status, created_at, activated_at)
     VALUES (?, ?, 'manual', 'active', ?, ?)`,
  )
    .bind(id, body, NOW - DAY * 30, NOW - DAY * 30)
    .run()
}

/** 質問ごとに、items[i]のタイトルの番号から決まるスコアを返すJevの代役 */
function fakeJev(requests: unknown[]): typeof fetch {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      model: string
      state: { items: { title: string }[] }
    }
    requests.push(body)
    const answers = Object.fromEntries(
      body.state.items.map((item, i) => [
        `i${i}`,
        { type: 'noul', noul: (Number(item.title.replace('Item ', '')) % 10) / 10 },
      ]),
    )
    return Response.json({ model: body.model, answers, usage: { input_tokens: 10 } })
  }
}

describe('scorePendingItems', () => {
  it('scores only unread recent items the active version has not scored', async () => {
    await seedFeed()
    await seedActiveVersion()
    await seedItem(1)
    await seedItem(2, { read: true })
    await seedItem(3, { publishedAt: NOW - DAY * 8 })
    await seedItem(4)
    await env.DB.prepare(
      'INSERT INTO item_scores (item_id, version_id, score, scored_at) VALUES (4, 1, 0.9, ?)',
    )
      .bind(NOW - 600)
      .run()

    const requests: unknown[] = []
    await withFetch(fakeJev(requests), () =>
      scorePendingItems({ ...env, JEV_API_KEY: 'test-key' }, NOW),
    )

    expect(requests).toHaveLength(1)
    const rows = await env.DB.prepare(
      'SELECT item_id, score FROM item_scores WHERE version_id = 1 ORDER BY item_id',
    ).all<{ item_id: number; score: number }>()
    expect(rows.results).toEqual([
      { item_id: 1, score: 0.1 },
      { item_id: 4, score: 0.9 },
    ])
  })

  it('does not call Jev without an API key', async () => {
    await seedFeed()
    await seedActiveVersion()
    await seedItem(1)
    const requests: unknown[] = []
    await withFetch(fakeJev(requests), () => scorePendingItems(env, NOW))
    expect(requests).toHaveLength(0)
  })
})
