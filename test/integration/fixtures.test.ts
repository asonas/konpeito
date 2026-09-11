import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { ingestFeed } from '../../src/server/services/ingest.ts'
import { FEED_FIXTURES } from '../fixtures/synthetic/catalog.ts'
import { toBody } from '../helpers.ts'

function decodeBody(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

describe('17.1 feed fixtures', () => {
  it('ingests every xml fixture without throwing and matches expected.json', async () => {
    expect(FEED_FIXTURES.length).toBeGreaterThan(0)
    const original = globalThis.fetch
    try {
      for (const fixture of FEED_FIXTURES) {
        globalThis.fetch = async () =>
          new Response(toBody(decodeBody(fixture.body)), {
            status: 200,
            headers: { 'Content-Type': 'application/rss+xml' },
          })
        const inserted = await env.DB.prepare(
          'INSERT INTO feeds (feed_url, title, next_fetch_at, created_at) VALUES (?, ?, 1, 1)',
        )
          .bind(`https://example.com/fixtures/${fixture.name}`, fixture.name)
          .run()
        const feedId = inserted.meta.last_row_id
        const result = await ingestFeed(env, feedId, { force: true, now: 1_756_857_600 })
        expect(result.outcome, fixture.name).not.toBe('error')
        const rows = await env.DB.prepare(
          'SELECT title FROM items WHERE feed_id = ? ORDER BY published_at ASC, id ASC',
        )
          .bind(feedId)
          .all<{ title: string }>()
        expect(
          rows.results.map((row) => row.title),
          fixture.name,
        ).toEqual(fixture.expected.titles)
      }
    } finally {
      globalThis.fetch = original
    }
  })
})
