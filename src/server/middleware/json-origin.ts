import type { MiddlewareHandler } from 'hono'
import { apiError } from '../../shared/errors.ts'

function isJsonContentType(value: string): boolean {
  const media = value.split(';')[0]?.trim().toLowerCase()
  return media === 'application/json'
}

/** bodyのないPOST（再取得や全文取得）は`Content-Type`を持たない */
function isBodyless(contentType: string | undefined, contentLength: string | undefined): boolean {
  return contentType === undefined && (contentLength === undefined || contentLength === '0')
}

export function requireJsonAndOrigin(): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      await next()
      return
    }
    const origin = c.req.header('origin')
    if (!origin || origin !== new URL(c.req.url).origin) {
      return c.json(apiError('forbidden', 'Invalid origin'), 403)
    }
    if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
      const contentType = c.req.header('content-type')
      if (
        !isBodyless(contentType, c.req.header('content-length')) &&
        !isJsonContentType(contentType ?? '')
      ) {
        return c.json(apiError('validation_error', 'Content-Type must be application/json'), 415)
      }
    }
    await next()
  }
}
