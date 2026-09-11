import type { MiddlewareHandler } from 'hono'

export function rateLimitAuth(): MiddlewareHandler {
  return async (c, next) => {
    const host = new URL(c.req.url).hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      await next()
      return
    }
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
    const { success } = await c.env.AUTH_LIMITER.limit({ key: ip })
    if (!success) {
      console.log({ event: 'ratelimit.block', ip })
      return c.text('Too Many Requests', 429)
    }
    await next()
  }
}
