import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ORIGIN } from '../helpers.ts'

describe('security headers', () => {
  it('includes the 10.8 headers on /robots.txt', async () => {
    const res = await SELF.fetch(`${ORIGIN}/robots.txt`)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
    expect(res.headers.get('Content-Security-Policy')).toContain('https://www.youtube-nocookie.com')
    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    )
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin')
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive')
    expect(res.headers.get('Permissions-Policy')).toBe('geolocation=(), camera=(), microphone=()')
    const body = await res.text()
    expect(body).toContain('Disallow: /')
  })

  it('allows the image proxy to load from other origins', async () => {
    const res = await SELF.fetch(`${ORIGIN}/img`)
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin')
  })
})
