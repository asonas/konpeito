import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { insertFeed } from '../../src/server/db/queries/feeds.ts'
import { requireUserHandle } from '../../src/server/lib/settings.ts'
import { ORIGIN, sessionCookie } from '../helpers.ts'

describe('feeds', () => {
  it('defaults show_lead_image to on and lets PATCH turn it off', async () => {
    const cookie = await sessionCookie()
    const id = await insertFeed(env.DB, { url: 'https://example.com/feed.xml', title: '例' })
    const created = await env.DB.prepare('SELECT show_lead_image FROM feeds WHERE id = ?')
      .bind(id)
      .first<{ show_lead_image: number }>()
    expect(created?.show_lead_image).toBe(1)

    const res = await SELF.fetch(`${ORIGIN}/api/v1/feeds/${id}`, {
      method: 'PATCH',
      headers: {
        Origin: ORIGIN,
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ show_lead_image: false }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { feed: { show_lead_image: number } }
    expect(body.feed.show_lead_image).toBe(0)
  })

  it('subscribes a discovered URL without fetching it again', async () => {
    const cookie = await sessionCookie()
    const res = await SELF.fetch(`${ORIGIN}/api/v1/feeds`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://skip.example.com/feed.xml',
        title: 'スキップ',
        skip_discovery: true,
      }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { created: boolean; feed: { title: string } }
    expect(body.created).toBe(true)
    expect(body.feed.title).toBe('スキップ')
  })

  it('returns the existing feed instead of subscribing twice', async () => {
    const cookie = await sessionCookie()
    const id = await insertFeed(env.DB, {
      url: 'https://twice.example.com/feed.xml',
      title: '既存',
    })
    const res = await SELF.fetch(`${ORIGIN}/api/v1/feeds`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://twice.example.com/feed.xml', skip_discovery: true }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { created: boolean; feed: { id: number } }
    expect(body.created).toBe(false)
    expect(body.feed.id).toBe(id)
  })

  it('exposes the feed URL so the edit dialog can show it', async () => {
    const cookie = await sessionCookie()
    await requireUserHandle(env.DB)
    await insertFeed(env.DB, { url: 'https://shown.example.com/feed.xml', title: '表示' })
    const res = await SELF.fetch(`${ORIGIN}/api/v1/bootstrap`, { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { feeds: { feed_url: string }[] }
    expect(body.feeds.map((feed) => feed.feed_url)).toContain('https://shown.example.com/feed.xml')
  })
})
