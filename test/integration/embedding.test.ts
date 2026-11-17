import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  type EmbeddingDeps,
  type VectorMatch,
} from '../../src/server/services/embedding/deps.ts'
import {
  embedPendingItems,
  findSimilarItems,
  purgeDeletedVectors,
  SIMILAR_LIMIT,
  SIMILAR_MIN_SCORE,
} from '../../src/server/services/embedding/jobs.ts'
import { ORIGIN, sessionCookie } from '../helpers.ts'

const NOW = 1_800_000_000

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM feeds WHERE id IN (801, 802)'),
    env.DB.prepare('DELETE FROM item_embeddings'),
    env.DB.prepare('DELETE FROM embedding_deletions'),
  ])
})

async function seedFeed(id = 801): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO feeds (id, feed_url, title, next_fetch_at, created_at)
     VALUES (?, ?, 'Embedding Feed', 0, 1)`,
  )
    .bind(id, `https://example.com/embedding-${id}.xml`)
    .run()
}

async function seedItem(
  id: number,
  options: { feedId?: number; title?: string; html?: string | null; hash?: string } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO items (id, feed_id, guid_hash, title, content_html, published_at, crawled_at, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      options.feedId ?? 801,
      `g-${id}`,
      options.title ?? `Item ${id}`,
      options.html === undefined ? `<p>Body ${id}</p>` : options.html,
      NOW - 60,
      NOW - 60,
      options.hash ?? 'h1',
    )
    .run()
}

type Fake = {
  deps: EmbeddingDeps
  embedded: string[][]
  vectors: Map<string, number[]>
  deleted: string[]
  matches: VectorMatch[]
  failEmbed: boolean
  /** このタイトルを含む呼び出しだけを失敗させる */
  failTitle: string | null
}

/** 呼び出しを控え、`matches`に入れた結果を`queryById`で返すWorkers AIとVectorizeの代役 */
function fakeDeps(): Fake {
  const fake: Fake = {
    embedded: [],
    vectors: new Map(),
    deleted: [],
    matches: [],
    failEmbed: false,
    failTitle: null,
    deps: {
      async embed(texts) {
        const failTitle = fake.failTitle
        if (fake.failEmbed || (failTitle !== null && texts.some((t) => t.includes(failTitle)))) {
          throw new Error('embedding is down')
        }
        fake.embedded.push([...texts])
        return texts.map(() => new Array<number>(EMBEDDING_DIMENSIONS).fill(0.1))
      },
      index: {
        async upsert(vectors) {
          for (const vector of vectors) {
            fake.vectors.set(vector.id, vector.values)
          }
        },
        async queryById() {
          return fake.matches
        },
        async deleteByIds(ids) {
          fake.deleted.push(...ids)
        },
      },
    },
  }
  return fake
}

async function ledger(): Promise<{ item_id: number; model: string | null; source_key: string }[]> {
  const rows = await env.DB.prepare(
    'SELECT item_id, model, source_key FROM item_embeddings ORDER BY item_id',
  ).all<{ item_id: number; model: string | null; source_key: string }>()
  return rows.results
}

async function deletions(): Promise<number[]> {
  const rows = await env.DB.prepare(
    'SELECT item_id FROM embedding_deletions ORDER BY item_id',
  ).all<{ item_id: number }>()
  return rows.results.map((row) => row.item_id)
}

describe('embedPendingItems', () => {
  it('embeds only the items that are not in the ledger yet', async () => {
    await seedFeed()
    await seedItem(8001)
    await seedItem(8002, { title: '', html: null })
    const fake = fakeDeps()

    await embedPendingItems(env.DB, fake.deps, NOW)
    expect(fake.embedded).toEqual([['title: Item 8001 | text: Body 8001']])
    expect([...fake.vectors.keys()]).toEqual(['8001'])
    expect(await ledger()).toEqual([
      { item_id: 8001, model: EMBEDDING_MODEL, source_key: 'h1:' },
      { item_id: 8002, model: null, source_key: 'h1:' },
    ])

    await seedItem(8003)
    await embedPendingItems(env.DB, fake.deps, NOW)
    expect(fake.embedded[1]).toEqual(['title: Item 8003 | text: Body 8003'])
    expect(fake.embedded).toHaveLength(2)
  })

  it('leaves the items pending when the embedding fails', async () => {
    await seedFeed()
    await seedItem(8001)
    const fake = fakeDeps()
    fake.failEmbed = true

    await expect(embedPendingItems(env.DB, fake.deps, NOW)).rejects.toThrow('embedding is down')
    expect(await ledger()).toEqual([])

    fake.failEmbed = false
    await embedPendingItems(env.DB, fake.deps, NOW)
    expect((await ledger()).map((row) => row.item_id)).toEqual([8001])
  })

  it('embeds again when the content or the model has changed', async () => {
    await seedFeed()
    await seedItem(8001)
    await seedItem(8002)
    const fake = fakeDeps()
    await embedPendingItems(env.DB, fake.deps, NOW)

    await env.DB.batch([
      env.DB.prepare(`UPDATE items SET content_hash = 'h2' WHERE id = 8001`),
      env.DB.prepare(`UPDATE item_embeddings SET model = 'old-model' WHERE item_id = 8002`),
    ])
    await embedPendingItems(env.DB, fake.deps, NOW)

    expect(fake.embedded[1]).toHaveLength(2)
    expect(await ledger()).toEqual([
      { item_id: 8001, model: EMBEDDING_MODEL, source_key: 'h2:' },
      { item_id: 8002, model: EMBEDDING_MODEL, source_key: 'h1:' },
    ])
    expect(await deletions()).toEqual([])
  })

  it('embeds again when the full content is fetched, which leaves the content hash alone', async () => {
    await seedFeed()
    await seedItem(8001)
    const fake = fakeDeps()
    await embedPendingItems(env.DB, fake.deps, NOW)

    await env.DB.prepare(
      `UPDATE items SET full_content_html = '<p>Full</p>', full_content_fetched_at = 123 WHERE id = 8001`,
    ).run()
    await embedPendingItems(env.DB, fake.deps, NOW)

    expect(fake.embedded[1]).toEqual(['title: Item 8001 | text: Full'])
  })

  it('sets aside an item that fails on its own, and tries it again a day later', async () => {
    await seedFeed()
    await seedItem(8001)
    await seedItem(8002, { title: 'Poison' })
    await seedItem(8003)
    const fake = fakeDeps()
    fake.failTitle = 'Poison'

    await embedPendingItems(env.DB, fake.deps, NOW)
    expect(await ledger()).toEqual([
      { item_id: 8001, model: EMBEDDING_MODEL, source_key: 'h1:' },
      { item_id: 8002, model: null, source_key: 'h1:' },
      { item_id: 8003, model: EMBEDDING_MODEL, source_key: 'h1:' },
    ])

    fake.failTitle = null
    await embedPendingItems(env.DB, fake.deps, NOW + 60)
    expect((await ledger())[1]?.model).toBe(null)
    await embedPendingItems(env.DB, fake.deps, NOW + 24 * 60 * 60 + 1)
    expect((await ledger())[1]?.model).toBe(EMBEDDING_MODEL)
  })
})

describe('purgeDeletedVectors', () => {
  it('removes the vectors of deleted items and of items in a deleted feed', async () => {
    await seedFeed(801)
    await seedFeed(802)
    await seedItem(8001)
    await seedItem(8002)
    await seedItem(8003, { feedId: 802 })
    // インデックスに入れていない記事は、消えても控えに回さない
    await seedItem(8004, { title: '', html: null })
    const fake = fakeDeps()
    await embedPendingItems(env.DB, fake.deps, NOW)

    await env.DB.batch([
      env.DB.prepare('DELETE FROM items WHERE id IN (8001, 8004)'),
      env.DB.prepare('DELETE FROM feeds WHERE id = 802'),
    ])
    expect(await deletions()).toEqual([8001, 8003])

    await purgeDeletedVectors(env.DB, fake.deps)
    expect(fake.deleted).toEqual(['8001', '8003'])
    expect(await deletions()).toEqual([])
  })
})

describe('findSimilarItems', () => {
  it('drops the item itself, weak matches and deleted items, best match first', async () => {
    await seedFeed()
    for (let id = 8001; id <= 8009; id += 1) {
      await seedItem(id)
    }
    const fake = fakeDeps()
    await embedPendingItems(env.DB, fake.deps, NOW)
    await env.DB.prepare('DELETE FROM items WHERE id = 8009').run()
    fake.matches = [
      { id: '8001', score: 1 },
      { id: '8009', score: 0.99 },
      { id: '8002', score: 0.8 },
      { id: '8003', score: 0.95 },
      { id: '8004', score: SIMILAR_MIN_SCORE - 0.01 },
      { id: '8005', score: 0.9 },
      { id: '8006', score: 0.85 },
      { id: '8007', score: 0.84 },
      { id: '8008', score: 0.83 },
    ]

    const similar = await findSimilarItems(env.DB, fake.deps, 8001)
    expect(similar.map((item) => item.id)).toEqual([8003, 8005, 8006, 8007, 8008])
    expect(similar).toHaveLength(SIMILAR_LIMIT)
    expect(similar[0]?.score).toBe(0.95)
  })

  it('returns nothing for an item that has no embedding', async () => {
    await seedFeed()
    await seedItem(8001)
    const fake = fakeDeps()
    fake.matches = [{ id: '8002', score: 0.9 }]
    expect(await findSimilarItems(env.DB, fake.deps, 8001)).toEqual([])
  })
})

describe('GET /api/v1/items/:id/similar', () => {
  it('requires a session', async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/v1/items/8001/similar`)
    expect(res.status).toBe(401)
  })

  it('returns no items on a server without the bindings', async () => {
    await seedFeed()
    await seedItem(8001)
    const res = await SELF.fetch(`${ORIGIN}/api/v1/items/8001/similar`, {
      headers: { Cookie: await sessionCookie() },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [] })
  })
})
