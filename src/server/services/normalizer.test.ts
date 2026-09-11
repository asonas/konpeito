import { describe, expect, it } from 'vitest'
import { FEED_FIXTURES } from '../../../test/fixtures/synthetic/catalog.ts'
import { sha256Hex } from '../lib/crypto.ts'
import { htmlToPlainText, htmlToPlainTextParagraphs, normalizeFeed } from './normalizer.ts'
import { parseFeed } from './parser/adapter.ts'
import { decodeFeedBody, sniffFormat } from './sniffer.ts'

const NOW = 1_756_857_600

function decodeBody(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function parseFixture(name: string) {
  const fixture = FEED_FIXTURES.find((row) => row.name === name)
  if (fixture === undefined) {
    throw new Error(`missing fixture ${name}`)
  }
  const body = decodeBody(fixture.body)
  const format = sniffFormat(body)
  if (format === null) {
    throw new Error(`could not sniff ${name}`)
  }
  return parseFeed(decodeFeedBody(body, 'application/xml', format), format)
}

describe('normalizeFeed', () => {
  it('hashes GUID, cleans tracking params, and sorts oldest first', () => {
    const feed = parseFixture('utf8-rss.xml')
    const { items, meta } = normalizeFeed(feed, {
      feedUrl: 'https://example.com/feed.xml',
      keepHashInUrl: false,
      now: NOW,
      isFirstFetch: true,
      initialUnreadCount: 1,
    })
    expect(meta.title).toBe('日本語ブログ')
    expect(meta.ttlSec).toBe(3600)
    expect(items).toHaveLength(2)
    expect(items[0]?.title).toBe('最初の記事')
    expect(items[1]?.title).toBe('新しい記事')
    expect(items[0]?.guidHash).toBe(sha256Hex('post-1'))
    expect(items[1]?.guidHash).toBe(sha256Hex('post-2'))
    expect(items[0]?.url).toBe('https://example.com/posts/1')
    expect(items[0]?.initialIsRead).toBe(true)
    expect(items[1]?.initialIsRead).toBe(false)
  })

  it('falls back to the cleaned article URL when GUID is missing', () => {
    const feed = parseFixture('no-guid.xml')
    const { items } = normalizeFeed(feed, {
      feedUrl: 'https://example.com/feed.xml',
      keepHashInUrl: false,
      now: NOW,
      isFirstFetch: false,
      initialUnreadCount: 20,
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.url).toBe('https://example.com/no-guid')
    expect(items[0]?.guidHash).toBe(sha256Hex('https://example.com/no-guid'))
  })

  it('replaces missing and future dates with now', () => {
    const { items } = normalizeFeed(
      {
        title: 't',
        siteUrl: 'https://example.com/',
        description: null,
        language: null,
        ttlMinutes: null,
        items: [
          {
            guid: 'a',
            guidIsPermalink: false,
            url: 'https://example.com/a',
            title: 'future',
            author: null,
            contentHtml: 'x',
            summaryText: null,
            publishedAt: '2099-01-01T00:00:00Z',
            updatedAt: null,
            enclosures: [],
            mediaThumbnails: [],
            mediaContents: [],
          },
        ],
      },
      {
        feedUrl: 'https://example.com/feed.xml',
        keepHashInUrl: false,
        now: NOW,
        isFirstFetch: false,
        initialUnreadCount: 20,
      },
    )
    expect(items[0]?.publishedAt).toBe(NOW)
  })

  it('drops empty items and duplicate enclosures already in the body', () => {
    const { items } = normalizeFeed(
      {
        title: 't',
        siteUrl: 'https://example.com/',
        description: null,
        language: null,
        ttlMinutes: null,
        items: [
          {
            guid: null,
            guidIsPermalink: true,
            url: null,
            title: null,
            author: null,
            contentHtml: null,
            summaryText: null,
            publishedAt: null,
            updatedAt: null,
            enclosures: [],
            mediaThumbnails: [],
            mediaContents: [],
          },
          {
            guid: 'enc',
            guidIsPermalink: false,
            url: 'https://example.com/e',
            title: 'has media',
            author: null,
            contentHtml: '<p><img src="https://example.com/pic.jpg"></p>',
            summaryText: null,
            publishedAt: '2024-01-01T00:00:00Z',
            updatedAt: null,
            enclosures: [{ url: 'https://example.com/pic.jpg', mime: 'image/jpeg', length: 10 }],
            mediaThumbnails: ['https://example.com/thumb.jpg'],
            mediaContents: [{ url: 'https://example.com/pic.jpg', mime: 'image/jpeg' }],
          },
        ],
      },
      {
        feedUrl: 'https://example.com/feed.xml',
        keepHashInUrl: false,
        now: NOW,
        isFirstFetch: false,
        initialUnreadCount: 20,
      },
    )
    expect(items).toHaveLength(1)
    expect(items[0]?.enclosure).toBeNull()
    expect(items[0]?.leadImageCandidates[0]).toBe('https://example.com/thumb.jpg')
  })

  it('resolves relative site and item URLs in two steps', () => {
    const feed = parseFixture('relative-urls.xml')
    const { items, meta } = normalizeFeed(feed, {
      feedUrl: 'https://example.com/feed.xml',
      keepHashInUrl: false,
      now: NOW,
      isFirstFetch: false,
      initialUnreadCount: 20,
    })
    expect(meta.siteUrl).toBe('https://example.com/blog/')
    expect(items[0]?.url).toBe('https://example.com/blog/hello')
    expect(items[0]?.contentHtml).toContain('https://example.com/blog/more')
    expect(items[0]?.contentHtml).toContain('https://example.com/img/a.png')
  })
})

describe('htmlToPlainText', () => {
  it('drops inline tags including wbr and spaces block tags', () => {
    expect(htmlToPlainText('<p>こんにちは。<wbr></wbr>世界</p>')).toBe('こんにちは。世界')
    expect(htmlToPlainText('<p>a</p><p>b</p>')).toBe('a b')
    expect(htmlToPlainText('<p>hello<br>world</p>')).toBe('hello world')
    expect(htmlToPlainText('<span>foo</span><strong>bar</strong>')).toBe('foobar')
  })
})

describe('htmlToPlainTextParagraphs', () => {
  it('splits block tags into paragraphs', () => {
    expect(htmlToPlainTextParagraphs('<p>a</p><p>b</p>')).toEqual(['a', 'b'])
  })
})
