import { Hono } from 'hono'
import { z } from 'zod'
import { blobToUint8Array } from '../lib/blob.ts'
import { base64UrlToBytes, timingSafeEqual } from '../lib/crypto.ts'
import { signedIconQuery, signedProxyQuery } from '../lib/image-proxy.ts'
import { assertSafeUrl, UnsafeUrlError } from '../services/fetcher.ts'
import type { AppEnv } from '../types.ts'

const querySchema = z
  .object({
    u: z.string().optional(),
    i: z.string().optional(),
    s: z.string(),
  })
  .refine((value) => (value.u !== undefined) !== (value.i !== undefined), {
    message: 'exactly one of u or i',
  })

const MAX_BYTES = 20 * 1024 * 1024
const TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 5

function decodeUrlParam(value: string): string | null {
  try {
    return new TextDecoder().decode(base64UrlToBytes(value))
  } catch {
    return null
  }
}

function isAllowedMediaType(contentType: string): boolean {
  const media = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  return media.startsWith('image/') || media.startsWith('video/') || media.startsWith('audio/')
}

async function fetchProxied(start: URL): Promise<Response> {
  let current = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertSafeUrl(current)
    const response = await fetch(current.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cf: { cacheEverything: true, cacheTtl: 604800 },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        return new Response('Bad Gateway', { status: 502 })
      }
      current = new URL(location, current)
      continue
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!isAllowedMediaType(contentType)) {
      return new Response('Unsupported Media Type', { status: 415 })
    }
    const lengthHeader = response.headers.get('content-length')
    if (lengthHeader && Number(lengthHeader) > MAX_BYTES) {
      return new Response('Payload Too Large', { status: 413 })
    }
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_BYTES) {
      return new Response('Payload Too Large', { status: 413 })
    }
    const headers = new Headers()
    headers.set('Content-Type', contentType)
    headers.set('Cache-Control', 'public, max-age=604800')
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
    return new Response(buffer, { status: response.status, headers })
  }
  return new Response('Too Many Redirects', { status: 508 })
}

export const image = new Hono<AppEnv>().get('/', async (c) => {
  const parsed = querySchema.safeParse({
    u: c.req.query('u'),
    i: c.req.query('i'),
    s: c.req.query('s'),
  })
  if (!parsed.success) {
    return c.text('Bad Request', 400)
  }
  const signature = parsed.data.s
  if (parsed.data.i !== undefined) {
    const expected = signedIconQuery(Number(parsed.data.i), c.env.IMAGE_PROXY_KEY).s
    if (!timingSafeEqual(signature, expected)) {
      return c.text('Forbidden', 403)
    }
    const feedId = Number(parsed.data.i)
    if (!Number.isInteger(feedId) || feedId <= 0) {
      return c.text('Bad Request', 400)
    }
    const row = await c.env.DB.prepare('SELECT icon, icon_mime FROM feeds WHERE id = ?')
      .bind(feedId)
      .first<{ icon: unknown; icon_mime: string | null }>()
    if (!row || row.icon === null || row.icon_mime === null) {
      return c.text('Not Found', 404)
    }
    const body = blobToUint8Array(row.icon)
    const buffer = new ArrayBuffer(body.byteLength)
    new Uint8Array(buffer).set(body)
    return new Response(buffer, {
      headers: {
        'Content-Type': row.icon_mime,
        'Cache-Control': 'public, max-age=604800',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    })
  }
  const rawUrl = parsed.data.u ? decodeUrlParam(parsed.data.u) : null
  if (!rawUrl) {
    return c.text('Bad Request', 400)
  }
  const expected = signedProxyQuery(rawUrl, c.env.IMAGE_PROXY_KEY).s
  if (!timingSafeEqual(signature, expected)) {
    return c.text('Forbidden', 403)
  }
  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return c.text('Bad Request', 400)
  }
  try {
    return await fetchProxied(target)
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return c.text('Forbidden', 403)
    }
    return c.text('Bad Gateway', 502)
  }
})
