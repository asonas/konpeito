import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { ORIGIN } from '../helpers.ts'

describe('auth and csrf', () => {
  it('rejects bootstrap registration when credentials already exist', async () => {
    await env.DB.prepare(
      `INSERT INTO credentials (id, public_key, counter, created_at) VALUES (?, ?, 0, 1)`,
    )
      .bind('existing-cred', new Uint8Array([1, 2, 3]))
      .run()
    const token = env.BOOTSTRAP_TOKEN
    const res = await SELF.fetch(
      `${ORIGIN}/auth/register/options?bootstrap=${encodeURIComponent(token)}`,
    )
    expect(res.status).toBe(403)
  })

  it('returns 401 for unauthenticated GET /api/v1/bootstrap', async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/v1/bootstrap`)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: { code: 'unauthorized', message: 'Unauthorized' } })
  })

  it('returns 429 on the 11th /auth/login/options request', async () => {
    let last = 0
    for (let i = 0; i < 11; i += 1) {
      const res = await SELF.fetch(`${ORIGIN}/auth/login/options`, {
        headers: { 'cf-connecting-ip': '203.0.113.10' },
      })
      last = res.status
    }
    expect(last).toBe(429)
  })
})
