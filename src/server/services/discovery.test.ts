import { describe, expect, it } from 'vitest'
import { discoverFeeds } from './discovery.ts'

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>shikakun</title>
  <link>https://shikakun.com/</link>
  <item><title>HTML</title><guid>https://shikakun.com/html/</guid><pubDate>Tue, 09 Sep 2025 00:00:00 GMT</pubDate></item>
</channel></rss>`

const COMMENTS_RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>Comments on shikakun</title>
  <link>https://shikakun.com/</link>
  <item><title>コメント</title><guid>https://shikakun.com/html/#comment-1</guid></item>
</channel></rss>`

const HOME = `<!DOCTYPE html><html lang="ja"><head>
<link rel="alternate" type="application/rss+xml" title="shikakun" href="/feed.xml">
</head><body></body></html>`

function xmlResponse(body: string, contentType: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': contentType } })
}

function htmlResponse(body: string): Response {
  return xmlResponse(body, 'text/html')
}

function routes(table: Record<string, () => Response>): typeof fetch {
  const expanded = new Map(Object.entries(table))
  for (const [key, value] of Object.entries(table)) {
    if (new URL(key).pathname === '/') {
      expanded.set(key.replace(/\/$/, ''), value)
    }
  }
  return (async (input: RequestInfo | URL) => {
    const entry = expanded.get(String(input))
    return entry === undefined ? new Response('missing', { status: 404 }) : entry()
  }) as typeof fetch
}

describe('discoverFeeds', () => {
  it('parses a direct RSS URL', async () => {
    const result = await discoverFeeds('https://shikakun.com/feed.xml', {
      now: () => 1,
      subscribedByUrl: new Map(),
      fetch: async (input) => {
        const href = String(input)
        expect(href).toBe('https://shikakun.com/feed.xml')
        return xmlResponse(RSS, 'application/xml')
      },
    })
    expect(result.alreadySubscribedFeedId).toBeNull()
    expect(result.candidates).toEqual([
      {
        url: 'https://shikakun.com/feed.xml',
        title: 'shikakun',
        subscribedFeedId: null,
        format: 'rss',
        itemCount: 1,
        latestItemAt: Math.floor(Date.UTC(2025, 8, 9) / 1000),
        comments: false,
      },
    ])
  })

  it('finds rel=alternate on a site HTML page', async () => {
    const result = await discoverFeeds('https://shikakun.com/', {
      now: () => 1,
      subscribedByUrl: new Map(),
      fetch: routes({
        'https://shikakun.com/': () => htmlResponse(HOME),
        'https://shikakun.com/feed.xml': () => xmlResponse(RSS, 'application/xml'),
      }),
    })
    expect(result.candidates.map((candidate) => candidate.url)).toEqual([
      'https://shikakun.com/feed.xml',
    ])
  })

  it('keeps a subscribed feed as a candidate so it can be shown as subscribed', async () => {
    const result = await discoverFeeds('https://shikakun.com/', {
      now: () => 1,
      subscribedByUrl: new Map([['https://shikakun.com/feed.xml', 7]]),
      fetch: routes({
        'https://shikakun.com/': () => htmlResponse(HOME),
        'https://shikakun.com/feed.xml': () => xmlResponse(RSS, 'application/xml'),
      }),
    })
    expect(result.failure).toBeNull()
    expect(result.candidates.map((candidate) => candidate.subscribedFeedId)).toEqual([7])
  })

  it('reports the subscribed feed for a URL that is already subscribed, without fetching', async () => {
    const result = await discoverFeeds('https://shikakun.com/feed.xml', {
      now: () => 1,
      subscribedByUrl: new Map([['https://shikakun.com/feed.xml', 3]]),
      fetch: async () => {
        throw new Error('should not fetch')
      },
    })
    expect(result.alreadySubscribedFeedId).toBe(3)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.subscribedFeedId).toBe(3)
  })

  it('accepts a feed advertised as text/xml', async () => {
    const html = `<!DOCTYPE html><html lang="ja"><head>
<link rel="alternate" type="text/xml" href="/index.rdf"></head><body></body></html>`
    const result = await discoverFeeds('https://shikakun.com/', {
      now: () => 1,
      subscribedByUrl: new Map(),
      fetch: routes({
        'https://shikakun.com/': () => htmlResponse(html),
        'https://shikakun.com/index.rdf': () => xmlResponse(RSS, 'text/xml'),
      }),
    })
    expect(result.candidates.map((candidate) => candidate.url)).toEqual([
      'https://shikakun.com/index.rdf',
    ])
  })

  it('tries common paths under the directory of the given URL', async () => {
    const result = await discoverFeeds('https://example.com/blog/', {
      now: () => 1,
      subscribedByUrl: new Map(),
      fetch: routes({
        'https://example.com/blog/': () =>
          htmlResponse('<!DOCTYPE html><html lang="en"><body>blog</body></html>'),
        'https://example.com/blog/feed': () => xmlResponse(RSS, 'application/xml'),
      }),
    })
    expect(result.candidates.map((candidate) => candidate.url)).toEqual([
      'https://example.com/blog/feed',
    ])
  })

  it('uses the per-service rule when the page itself cannot be fetched', async () => {
    const tried: string[] = []
    const result = await discoverFeeds('https://github.com/shikakun/konpeito', {
      now: () => 1,
      subscribedByUrl: new Map(),
      fetch: async (input) => {
        const href = String(input)
        tried.push(href)
        if (href === 'https://github.com/shikakun/konpeito/releases.atom') {
          return xmlResponse(RSS, 'application/xml')
        }
        return new Response('forbidden', { status: 403 })
      },
    })
    expect(result.candidates.map((candidate) => candidate.url)).toEqual([
      'https://github.com/shikakun/konpeito/releases.atom',
    ])
    expect(tried).toContain('https://github.com/shikakun/konpeito/commits.atom')
  })

  it('puts a comments feed after the article feed', async () => {
    const html = `<!DOCTYPE html><html lang="ja"><head>
<link rel="alternate" type="application/rss+xml" href="/comments/feed">
<link rel="alternate" type="application/rss+xml" href="/feed">
</head><body></body></html>`
    const result = await discoverFeeds('https://shikakun.com/', {
      now: () => 1,
      subscribedByUrl: new Map(),
      fetch: routes({
        'https://shikakun.com/': () => htmlResponse(html),
        'https://shikakun.com/comments/feed': () => xmlResponse(COMMENTS_RSS, 'application/xml'),
        'https://shikakun.com/feed': () => xmlResponse(RSS, 'application/xml'),
      }),
    })
    expect(result.candidates.map((candidate) => candidate.url)).toEqual([
      'https://shikakun.com/feed',
      'https://shikakun.com/comments/feed',
    ])
    expect(result.candidates[1]?.comments).toBe(true)
  })

  it('stops after a handful of in-page links', async () => {
    const anchors = Array.from(
      { length: 8 },
      (_, index) => `<a href="/link${index}.rss">feed</a>`,
    ).join('')
    let tried = 0
    const result = await discoverFeeds('https://example.com/', {
      now: () => 1,
      subscribedByUrl: new Map(),
      fetch: async (input) => {
        const href = String(input)
        if (href === 'https://example.com/') {
          return htmlResponse(`<!DOCTYPE html><html lang="en"><body>${anchors}</body></html>`)
        }
        if (/\/link\d+\.rss$/.test(href)) {
          tried += 1
          return xmlResponse(RSS, 'application/xml')
        }
        return new Response('missing', { status: 404 })
      },
    })
    expect(tried).toBe(5)
    expect(result.candidates).toHaveLength(5)
  })

  it('reports the HTTP status when the URL cannot be fetched', async () => {
    const result = await discoverFeeds('https://shikakun.com/nope.xml', {
      now: () => 1,
      subscribedByUrl: new Map(),
      fetch: async () => new Response('missing', { status: 404 }),
    })
    expect(result.candidates).toEqual([])
    expect(result.failure).toEqual({ errorKind: 'not_found', status: 404 })
  })

  it('reports a redirect loop instead of following it to the limit', async () => {
    let calls = 0
    const result = await discoverFeeds('https://shikakun.com/loop.xml', {
      now: () => 1,
      subscribedByUrl: new Map(),
      fetch: async () => {
        calls += 1
        return new Response(null, {
          status: 302,
          headers: { location: 'https://shikakun.com/loop.xml' },
        })
      },
    })
    expect(result.failure).toEqual({ errorKind: 'redirect_loop', status: 302 })
    expect(calls).toBe(1)
  })

  it('reports that no feed was found on a page without one', async () => {
    const result = await discoverFeeds('https://shikakun.com/', {
      now: () => 1,
      subscribedByUrl: new Map(),
      fetch: async (input) =>
        String(input).startsWith('https://shikakun.com/') &&
        !String(input).includes('feed') &&
        !String(input).includes('rss') &&
        !String(input).includes('atom') &&
        !String(input).includes('index.xml')
          ? htmlResponse('<!DOCTYPE html><html lang="ja"><body>no feed</body></html>')
          : new Response('missing', { status: 404 }),
    })
    expect(result.candidates).toEqual([])
    expect(result.failure).toEqual({ errorKind: 'unsupported_format', status: null })
  })
})
