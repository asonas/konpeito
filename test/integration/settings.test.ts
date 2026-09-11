import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { ORIGIN, sessionCookie } from '../helpers.ts'

async function upsertSetting(key: string, value: unknown): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  )
    .bind(key, JSON.stringify(value))
    .run()
}

describe('settings', () => {
  it('ignores rows for keys the schema no longer has', async () => {
    await upsertSetting('user_handle', '11111111-1111-4111-8111-111111111111')
    await upsertSetting('font_size', 'large')
    await upsertSetting('auto_mark_read', false)
    const res = await SELF.fetch(`${ORIGIN}/api/v1/bootstrap`, {
      headers: { Origin: ORIGIN, Cookie: await sessionCookie() },
    })
    expect(res.status).toBe(200)
    const { settings } = (await res.json()) as { settings: Record<string, unknown> }
    expect(settings.auto_mark_read).toBe(false)
    expect(settings.font_size).toBeUndefined()
    expect(settings.initial_unread_count).toBe(100)
    expect(settings.locale).toBe('en')
  })

  it('persists locale through PATCH', async () => {
    const cookie = await sessionCookie()
    const patch = await SELF.fetch(`${ORIGIN}/api/v1/settings`, {
      method: 'PATCH',
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ locale: 'ja' }),
    })
    expect(patch.status).toBe(200)
    const patched = (await patch.json()) as { locale: string }
    expect(patched.locale).toBe('ja')
    const get = await SELF.fetch(`${ORIGIN}/api/v1/bootstrap`, {
      headers: {
        Origin: ORIGIN,
        Cookie: cookie,
      },
    })
    expect(get.status).toBe(200)
    const { settings } = (await get.json()) as { settings: { locale: string } }
    expect(settings.locale).toBe('ja')
  })

  it('rejects PATCH values the schema does not accept', async () => {
    const cookie = await sessionCookie()
    const cases: Record<string, unknown>[] = [
      { initial_unread_count: 999 },
      { user_handle: '11111111-1111-4111-8111-111111111111' },
      { font_size: 'large' },
    ]
    for (const body of cases) {
      const res = await SELF.fetch(`${ORIGIN}/api/v1/settings`, {
        method: 'PATCH',
        headers: {
          Origin: ORIGIN,
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify(body),
      })
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
  })
})
