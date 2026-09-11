import { describe, expect, it } from 'vitest'
import { assertSafeUrl, fetchBytes, fetchFeed, UnsafeUrlError } from './fetcher.ts'

function response(body: string, init: ResponseInit): Response {
  return new Response(body, init)
}

describe('assertSafeUrl', () => {
  it('allows public https on 443', () => {
    expect(() => assertSafeUrl(new URL('https://example.com/feed.xml'))).not.toThrow()
  })

  it('blocks private IPv4, localhost, and reserved names', () => {
    const blocked = [
      'http://127.0.0.1/',
      'http://10.0.0.1/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'http://169.254.1.1/',
      'http://100.64.0.1/',
      'http://0.0.0.0/',
      'http://localhost/',
      'http://foo.localhost/',
      'http://printer.local/',
      'http://svc.internal/',
      'http://1.0.0.127.in-addr.arpa/',
      'http://[::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://example.com:22/',
      // inet_atonの短縮形。`new URL()`が点4つに直すが、直さない経路でも通さない
      'http://127.1/',
      'http://2130706433/',
      'http://10.1/',
    ]
    for (const href of blocked) {
      expect(() => assertSafeUrl(new URL(href)), href).toThrow(UnsafeUrlError)
    }
  })
})

describe('fetchFeed', () => {
  const baseInput = {
    url: 'https://example.com/feed.xml',
    etag: null,
    lastModified: null,
    bodyHash: null,
    noCache: false,
    force: false,
  }

  it('returns not_modified on 304 and keeps Last-Modified', async () => {
    const outcome = await fetchFeed(baseInput, {
      now: () => 1_700_000_000,
      fetch: async () => {
        const res = response('', {
          status: 200,
          headers: { 'Last-Modified': 'Wed, 01 Jan 2020 00:00:00 GMT' },
        })
        Object.defineProperty(res, 'status', { value: 304 })
        Object.defineProperty(res, 'ok', { value: false })
        return res
      },
    })
    expect(outcome).toEqual({ kind: 'not_modified', lastModified: 'Wed, 01 Jan 2020 00:00:00 GMT' })
  })

  it('returns unchanged when ETag matches', async () => {
    const outcome = await fetchFeed(
      { ...baseInput, etag: '"abc"' },
      {
        now: () => 1_700_000_000,
        fetch: async () =>
          response('<rss></rss>', {
            status: 200,
            headers: { ETag: '"abc"', 'Content-Type': 'application/rss+xml' },
          }),
      },
    )
    expect(outcome).toEqual({ kind: 'unchanged' })
  })

  it('returns unchanged when body hash matches', async () => {
    const body = '<rss></rss>'
    const first = await fetchFeed(baseInput, {
      now: () => 1_700_000_000,
      fetch: async () => response(body, { status: 200 }),
    })
    if (first.kind !== 'ok') {
      throw new Error('expected ok')
    }
    const second = await fetchFeed(
      { ...baseInput, bodyHash: first.bodyHash },
      {
        now: () => 1_700_000_000,
        fetch: async () => response(body, { status: 200 }),
      },
    )
    expect(second).toEqual({ kind: 'unchanged' })
  })

  it('detects Expires: 0 as noCache and drops cache headers', async () => {
    const outcome = await fetchFeed(baseInput, {
      now: () => 1_700_000_000,
      fetch: async () =>
        response('<rss></rss>', {
          status: 200,
          headers: { ETag: '"x"', Expires: '0', 'Content-Type': 'application/xml' },
        }),
    })
    if (outcome.kind !== 'ok') {
      throw new Error('expected ok')
    }
    expect(outcome.noCache).toBe(true)
    expect(outcome.etag).toBeNull()
    expect(outcome.lastModified).toBeNull()
  })

  it('classifies HTTP errors', async () => {
    const cases: { status: number; headers: Record<string, string>; errorKind: string }[] = [
      { status: 410, headers: {}, errorKind: 'gone' },
      { status: 404, headers: {}, errorKind: 'not_found' },
      { status: 401, headers: {}, errorKind: 'forbidden' },
      { status: 403, headers: {}, errorKind: 'forbidden' },
      {
        status: 403,
        headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' },
        errorKind: 'cf_challenge',
      },
      { status: 429, headers: { 'Retry-After': '120' }, errorKind: 'rate_limited' },
      { status: 503, headers: { 'Retry-After': '30' }, errorKind: 'rate_limited' },
      { status: 502, headers: {}, errorKind: 'http_5xx' },
      { status: 418, headers: {}, errorKind: 'http_4xx' },
    ]
    for (const row of cases) {
      const outcome = await fetchFeed(baseInput, {
        now: () => 1_700_000_000,
        fetch: async () => response('<html></html>', { status: row.status, headers: row.headers }),
      })
      if (outcome.kind !== 'error') {
        throw new Error(`expected error for ${row.status}`)
      }
      expect(outcome.errorKind, String(row.status)).toBe(row.errorKind)
    }
  })

  it('rejects empty bodies', async () => {
    const outcome = await fetchFeed(baseInput, {
      now: () => 1_700_000_000,
      fetch: async () => response('', { status: 200, headers: { 'Content-Length': '0' } }),
    })
    if (outcome.kind !== 'error') {
      throw new Error('expected error')
    }
    expect(outcome.errorKind).toBe('empty_body')
  })

  it('rejects oversized Content-Length without reading', async () => {
    const outcome = await fetchFeed(baseInput, {
      now: () => 1_700_000_000,
      fetch: async () =>
        new Response('ignored', {
          status: 200,
          headers: { 'Content-Length': String(6 * 1024 * 1024) },
        }),
    })
    if (outcome.kind !== 'error') {
      throw new Error('expected error')
    }
    expect(outcome.errorKind).toBe('too_large')
  })

  it('follows redirects and blocks SSRF on hop', async () => {
    const outcome = await fetchFeed(baseInput, {
      now: () => 1_700_000_000,
      fetch: async (input) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (url === 'https://example.com/feed.xml') {
          return response('', { status: 302, headers: { Location: 'http://127.0.0.1/secret' } })
        }
        throw new Error(`unexpected ${url}`)
      },
    })
    if (outcome.kind !== 'error') {
      throw new Error('expected error')
    }
    expect(outcome.errorKind).toBe('ssrf_blocked')
  })

  it('reports redirect_loop after 5 hops', async () => {
    const outcome = await fetchFeed(baseInput, {
      now: () => 1_700_000_000,
      fetch: async (input) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        return response('', { status: 302, headers: { Location: `${url}?n=1` } })
      },
    })
    if (outcome.kind !== 'error') {
      throw new Error('expected error')
    }
    expect(outcome.errorKind).toBe('redirect_loop')
  })

  it('classifies timeout and network failures', async () => {
    const timeout = await fetchFeed(baseInput, {
      now: () => 1,
      fetch: async () => {
        const err = new Error('aborted')
        err.name = 'TimeoutError'
        throw err
      },
    })
    if (timeout.kind !== 'error') {
      throw new Error('expected error')
    }
    expect(timeout.errorKind).toBe('timeout')

    const network = await fetchFeed(baseInput, {
      now: () => 1,
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
    })
    if (network.kind !== 'error') {
      throw new Error('expected error')
    }
    expect(network.errorKind).toBe('network')
  })

  it('calls native-style fetch with globalThis so Workers does not throw Illegal invocation', async () => {
    function nativeLike(this: unknown, input: RequestInfo | URL): Promise<Response> {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation: function called with incorrect `this` reference.')
      }
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      expect(href).toBe('https://example.com/feed.xml')
      return Promise.resolve(
        response('<rss version="2.0"><channel><title>x</title></channel></rss>', { status: 200 }),
      )
    }
    const outcome = await fetchFeed(baseInput, {
      now: () => 1,
      fetch: nativeLike,
    })
    expect(outcome.kind).toBe('ok')
  })

  it('sends the feed headers by default and lets fetchBytes replace them', async () => {
    const seen: Headers[] = []
    const fetchFn: typeof fetch = async (_input, init) => {
      seen.push(new Headers(init?.headers))
      return response('<html></html>', { status: 200 })
    }
    await fetchBytes('https://example.com/post', { fetch: fetchFn, now: () => 1 })
    await fetchBytes(
      'https://example.com/post',
      { fetch: fetchFn, now: () => 1 },
      { headers: { Accept: 'text/html', 'User-Agent': 'article-bot' } },
    )
    expect(seen[0]?.get('User-Agent')).toContain('konpeito/1.0')
    expect(seen[0]?.get('Accept')).toContain('application/atom+xml')
    // Workersが勝手に付け直すので、こちらからは指定しない
    expect(seen[0]?.has('Accept-Encoding')).toBe(false)
    expect(seen[1]?.get('Accept')).toBe('text/html')
    expect(seen[1]?.get('User-Agent')).toBe('article-bot')
  })
})
