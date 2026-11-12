import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  runPreferenceLearning,
  scorePendingItems,
} from '../../src/server/services/recommendation/jobs.ts'
import { createManualVersion } from '../../src/server/services/recommendation/store.ts'
import { ORIGIN, sessionCookie, withFetch } from '../helpers.ts'

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

async function api(path: string, init: RequestInit & { cookie?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { Origin: ORIGIN }
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (init.cookie !== undefined) {
    headers.Cookie = init.cookie
  }
  return SELF.fetch(`${ORIGIN}/api/v1${path}`, { ...init, headers })
}

async function seedScore(itemId: number, score: number, versionId = 1): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO item_scores (item_id, version_id, score, scored_at) VALUES (?, ?, ?, ?)',
  )
    .bind(itemId, versionId, score, NOW)
    .run()
}

describe('recommendation API', () => {
  it.each([
    ['GET', '/recommendations', undefined],
    ['POST', '/items/1/events', JSON.stringify({ kind: 'like' })],
    ['GET', '/items/1/feedback', undefined],
    ['GET', '/recommendation/status', undefined],
    ['PUT', '/recommendation/preference', JSON.stringify({ body: 'x' })],
  ])('rejects %s %s without a session', async (method, path, body) => {
    await seedFeed()
    await seedItem(1)
    const res = await api(path, { method, ...(body !== undefined ? { body } : {}) })
    expect(res.status).toBe(401)
    const written = await env.DB.prepare(
      'SELECT (SELECT COUNT(*) FROM item_events) + (SELECT COUNT(*) FROM preference_versions) AS n',
    ).first<{ n: number }>()
    expect(written?.n).toBe(0)
  })

  it('ranks unread items by score and mixes in exploration', async () => {
    await seedFeed()
    await seedActiveVersion()
    for (let id = 1; id <= 12; id += 1) {
      await seedItem(id, { read: id === 12 })
      await seedScore(id, id / 100)
    }
    const cookie = await sessionCookie()

    const res = await api('/recommendations?limit=10', { cookie })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: { id: number; explore: boolean }[]
      version: number
    }
    expect(body.version).toBe(1)
    expect(body.items).toHaveLength(10)
    expect(body.items.map((item) => item.id)).not.toContain(12)
    const top = body.items.filter((item) => !item.explore).map((item) => item.id)
    expect(top).toEqual([11, 10, 9, 8, 7, 6, 5, 4])
    expect(body.items.map((item) => item.explore)).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      true,
    ])
    // 一覧を返しただけでは、画面に出ていない記事も含むので表示として数えない
    const listed = await env.DB.prepare('SELECT COUNT(*) AS n FROM item_events').first<{
      n: number
    }>()
    expect(listed?.n).toBe(0)
  })

  it('records the first impression of an item with the active version and its score', async () => {
    await seedFeed()
    await seedActiveVersion()
    await seedItem(1)
    await seedScore(1, 0.42)
    const cookie = await sessionCookie()
    const post = () =>
      api('/items/1/events', {
        method: 'POST',
        cookie,
        body: JSON.stringify({ kind: 'impression' }),
      })
    expect((await post()).status).toBe(200)
    expect((await post()).status).toBe(200)
    const rows = await env.DB.prepare(
      "SELECT version_id, score FROM item_events WHERE kind = 'impression'",
    ).all()
    expect(rows.results).toEqual([{ version_id: 1, score: 0.42 }])
  })

  it('returns 404 for events on a missing item', async () => {
    await seedFeed()
    const res = await api('/items/999/events', {
      method: 'POST',
      cookie: await sessionCookie(),
      body: JSON.stringify({ kind: 'open' }),
    })
    expect(res.status).toBe(404)
  })

  it('reports the latest explicit feedback', async () => {
    await seedFeed()
    await seedItem(1)
    const cookie = await sessionCookie()
    const post = (kind: string) =>
      api('/items/1/events', { method: 'POST', cookie, body: JSON.stringify({ kind }) })
    await post('like')
    await post('dislike')
    const res = await api('/items/1/feedback', { cookie })
    expect(await res.json()).toEqual({ feedback: 'dislike' })
    await post('clear_feedback')
    const cleared = await api('/items/1/feedback', { cookie })
    expect(await cleared.json()).toEqual({ feedback: null })
  })
})

/** OpenAIは`proposal`を返し、Jevは嗜好文ごとに`scoreFor`で決めたスコアを返す */
function fakeApis(
  proposal: string,
  scoreFor: (preference: string, title: string) => number,
): typeof fetch {
  return async (input, init) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body))
    if (url.startsWith('https://api.openai.com/')) {
      const text = JSON.stringify({ preference: proposal, rationale: 'because' })
      return Response.json({
        output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
      })
    }
    const { preference, items } = body.state as { preference: string; items: { title: string }[] }
    const answers = Object.fromEntries(
      items.map((item, i) => [`i${i}`, { type: 'noul', noul: scoreFor(preference, item.title) }]),
    )
    return Response.json({ model: body.model, answers })
  }
}

/** Item 1〜15を高評価、16〜30を低評価にする */
async function seedLabeledItems(): Promise<void> {
  await seedFeed()
  await seedActiveVersion(1, 'OLD')
  for (let id = 1; id <= 30; id += 1) {
    await seedItem(id, { read: true })
    await env.DB.prepare('INSERT INTO item_events (item_id, kind, created_at) VALUES (?, ?, ?)')
      .bind(id, id <= 15 ? 'like' : 'dislike', NOW - 3600)
      .run()
  }
}

const liked = (title: string) => Number(title.replace('Item ', '')) <= 15
const keys = { JEV_API_KEY: 'jev', OPENAI_API_KEY: 'openai' }

describe('runPreferenceLearning', () => {
  it('activates a candidate that separates liked from disliked items better', async () => {
    await seedLabeledItems()
    await withFetch(
      fakeApis('NEW', (preference, title) =>
        preference === 'NEW' ? (liked(title) ? 0.9 : 0.1) : 0.5,
      ),
      () => runPreferenceLearning({ ...env, ...keys }, NOW),
    )
    const versions = await env.DB.prepare(
      'SELECT body, status, parent_id FROM preference_versions ORDER BY id',
    ).all()
    expect(versions.results).toEqual([
      { body: 'OLD', status: 'retired', parent_id: null },
      { body: 'NEW', status: 'active', parent_id: 1 },
    ])
    // 評価で採点した記事は、公開から日が経っていても採用後のおすすめに出せる
    const scored = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM item_scores WHERE version_id = (SELECT id FROM preference_versions WHERE status = 'active')",
    ).first<{ n: number }>()
    expect(scored?.n).toBe(30)
  })

  it('keeps the active version when the candidate does worse', async () => {
    await seedLabeledItems()
    await withFetch(
      fakeApis('NEW', (preference, title) =>
        preference === 'NEW' ? (liked(title) ? 0.1 : 0.9) : liked(title) ? 0.6 : 0.4,
      ),
      () => runPreferenceLearning({ ...env, ...keys }, NOW),
    )
    const versions = await env.DB.prepare(
      'SELECT body, status, eval_json FROM preference_versions ORDER BY id',
    ).all<{ body: string; status: string; eval_json: string | null }>()
    expect(versions.results.map((row) => [row.body, row.status])).toEqual([
      ['OLD', 'active'],
      ['NEW', 'rejected'],
    ])
    expect(JSON.parse(versions.results[1]?.eval_json ?? '{}')).toMatchObject({
      auc_active: 1,
      auc_candidate: 0,
    })
  })

  it('does not call the APIs until enough new feedback arrives', async () => {
    await seedLabeledItems()
    await env.DB.prepare('UPDATE preference_versions SET created_at = ?').bind(NOW).run()
    let calls = 0
    await withFetch(
      async () => {
        calls += 1
        return new Response('unexpected', { status: 500 })
      },
      () => runPreferenceLearning({ ...env, ...keys }, NOW),
    )
    expect(calls).toBe(0)
  })
})

describe('PUT /recommendation/preference', () => {
  it('replaces the active version and keeps the previous one as its parent', async () => {
    await seedActiveVersion(1, 'OLD')
    const res = await api('/recommendation/preference', {
      method: 'PUT',
      cookie: await sessionCookie(),
      body: JSON.stringify({ body: '  Ruby and keyboards  ' }),
    })
    expect(res.status).toBe(200)
    const versions = await env.DB.prepare(
      'SELECT body, source, status, parent_id FROM preference_versions ORDER BY id',
    ).all()
    expect(versions.results).toEqual([
      { body: 'OLD', source: 'manual', status: 'retired', parent_id: null },
      { body: 'Ruby and keyboards', source: 'manual', status: 'active', parent_id: 1 },
    ])
  })
})

describe('runPreferenceLearning edge cases', () => {
  it('does not replace a preference saved while the candidate was being evaluated', async () => {
    await seedLabeledItems()
    const apis = fakeApis('NEW', (preference, title) =>
      preference === 'NEW' ? (liked(title) ? 0.9 : 0.1) : 0.5,
    )
    let saved = false
    await withFetch(
      async (input, init) => {
        if (!saved && String(input).startsWith('https://api.openai.com/')) {
          saved = true
          await createManualVersion(env.DB, 'SAVED MEANWHILE', NOW)
        }
        return apis(input, init)
      },
      () => runPreferenceLearning({ ...env, ...keys }, NOW),
    )
    const versions = await env.DB.prepare(
      'SELECT body, status FROM preference_versions ORDER BY id',
    ).all<{ body: string; status: string }>()
    expect(versions.results.map((row) => [row.body, row.status])).toEqual([
      ['OLD', 'retired'],
      ['SAVED MEANWHILE', 'active'],
      ['NEW', 'rejected'],
    ])
  })

  it('retries with the same feedback after Jev fails', async () => {
    await seedLabeledItems()
    await withFetch(
      async (input, init) => {
        if (String(input).startsWith('https://api.openai.com/')) {
          return fakeApis('NEW', () => 0.5)(input, init)
        }
        return new Response('slow down', { status: 429 })
      },
      () => runPreferenceLearning({ ...env, ...keys }, NOW),
    )
    let openAiCalls = 0
    const apis = fakeApis('NEWER', (preference, title) =>
      preference === 'NEWER' ? (liked(title) ? 0.9 : 0.1) : 0.5,
    )
    await withFetch(
      async (input, init) => {
        if (String(input).startsWith('https://api.openai.com/')) {
          openAiCalls += 1
        }
        return apis(input, init)
      },
      () => runPreferenceLearning({ ...env, ...keys }, NOW + DAY),
    )
    expect(openAiCalls).toBe(1)
    const active = await env.DB.prepare(
      "SELECT body FROM preference_versions WHERE status = 'active'",
    ).first<{ body: string }>()
    expect(active?.body).toBe('NEWER')
  })
})
