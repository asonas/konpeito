import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { signedIconQuery, signedProxyQuery } from '../../src/server/lib/image-proxy.ts'
import { ORIGIN } from '../helpers.ts'

describe('image proxy', () => {
  it('rejects a bad signature with 403', async () => {
    const res = await SELF.fetch(`${ORIGIN}/img?u=abc&s=deadbeef`)
    expect(res.status).toBe(403)
  })

  it('returns 415 when the origin response is HTML', async () => {
    const original = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      if (url.includes('example.com/not-an-image')) {
        return new Response('<html>nope</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      }
      return original(input, init)
    }
    try {
      const signed = signedProxyQuery('https://example.com/not-an-image', env.IMAGE_PROXY_KEY)
      const res = await SELF.fetch(
        `${ORIGIN}/img?u=${encodeURIComponent(signed.u)}&s=${encodeURIComponent(signed.s)}`,
      )
      expect(res.status).toBe(415)
    } finally {
      globalThis.fetch = original
    }
  })

  it('returns a feed icon with icon_mime', async () => {
    const png = new Uint8Array([137, 80, 78, 71])
    await env.DB.prepare(
      `INSERT INTO feeds (id, feed_url, title, icon, icon_mime, next_fetch_at, created_at)
       VALUES (7, ?, 'Icon', ?, 'image/png', 1, 1)`,
    )
      .bind('https://example.com/icon.xml', png)
      .run()
    const signed = signedIconQuery(7, env.IMAGE_PROXY_KEY)
    const res = await SELF.fetch(`${ORIGIN}/img?i=${signed.i}&s=${encodeURIComponent(signed.s)}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin')
  })

  it('returns 404 for a missing feed icon', async () => {
    const signed = signedIconQuery(999, env.IMAGE_PROXY_KEY)
    const res = await SELF.fetch(`${ORIGIN}/img?i=${signed.i}&s=${encodeURIComponent(signed.s)}`)
    expect(res.status).toBe(404)
  })
})
