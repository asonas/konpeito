import type { Context, MiddlewareHandler, Next } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { bytesToBase64Url, nowSec, randomBytes, sha256Hex } from '../lib/crypto.ts'

export const SESSION_COOKIE = '__Host-session'
const SESSION_TTL_SEC = 30 * 24 * 60 * 60
const SLIDE_AFTER_SEC = 60 * 60

export interface SessionRow {
  id: string
  createdAt: number
  expiresAt: number
  lastSeenAt: number
  userAgent: string | null
}

export async function createSession(db: D1Database, userAgent: string | null): Promise<string> {
  const raw = bytesToBase64Url(randomBytes(32))
  const hash = sha256Hex(raw)
  const now = nowSec()
  await db
    .prepare(
      'INSERT INTO sessions (id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(hash, now, now + SESSION_TTL_SEC, now, userAgent)
    .run()
  return raw
}

export function setSessionCookie(c: Context, raw: string): void {
  setCookie(c, SESSION_COOKIE, raw, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: SESSION_TTL_SEC,
  })
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true })
}

export async function loadSession(
  db: D1Database,
  raw: string | undefined,
): Promise<SessionRow | null> {
  if (!raw) {
    return null
  }
  const hash = sha256Hex(raw)
  const row = await db
    .prepare(
      'SELECT id, created_at AS createdAt, expires_at AS expiresAt, last_seen_at AS lastSeenAt, user_agent AS userAgent FROM sessions WHERE id = ?',
    )
    .bind(hash)
    .first<SessionRow>()
  if (!row) {
    return null
  }
  const now = nowSec()
  if (row.expiresAt <= now) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(hash).run()
    return null
  }
  if (now - row.lastSeenAt >= SLIDE_AFTER_SEC) {
    await db
      .prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
      .bind(now, now + SESSION_TTL_SEC, hash)
      .run()
    return { ...row, lastSeenAt: now, expiresAt: now + SESSION_TTL_SEC }
  }
  return row
}

export function requireSession(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const raw = getCookie(c, SESSION_COOKIE)
    const session = await loadSession(c.env.DB, raw)
    if (!session) {
      return c.json({ error: { code: 'unauthorized', message: 'Unauthorized' } }, 401)
    }
    c.set('session', session)
    await next()
  }
}
