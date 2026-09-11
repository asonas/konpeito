import type { Context, Next } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { EMBED_FRAME_SRC } from '../../shared/sanitize-policy.ts'

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  `frame-src ${EMBED_FRAME_SRC.join(' ')}`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

function isImageProxyPath(path: string): boolean {
  return path === '/img' || path.startsWith('/img/')
}

export function securityHeadersMiddleware() {
  const apply = secureHeaders({
    strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'no-referrer',
    xFrameOptions: false,
    xXssProtection: false,
    crossOriginOpenerPolicy: 'same-origin',
    crossOriginResourcePolicy: 'same-origin',
  })
  return async (c: Context, next: Next) => {
    await apply(c, next)
    // /imgは同期クライアントのWebViewから別のoriginで読む
    // same-originだと拒否される
    if (isImageProxyPath(c.req.path)) {
      c.header('Cross-Origin-Resource-Policy', 'cross-origin')
    }
  }
}

export function applyAppHeaders(c: Context): void {
  c.header('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  c.header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  c.header('Permissions-Policy', 'geolocation=(), camera=(), microphone=()')
}
