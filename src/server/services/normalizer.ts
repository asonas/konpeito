import { sha256Hex } from '../lib/crypto.ts'
import { parseFeedDate } from './date-parser.ts'
import type { ParsedFeed, ParsedItem } from './parser/types.ts'
import { cleanTrackingParams, type FeedHosts } from './url-cleaner.ts'

interface NormalizeContext {
  feedUrl: string
  keepHashInUrl: boolean
  now: number
  isFirstFetch: boolean
  initialUnreadCount: number
}

interface NormalizedFeedMeta {
  title: string
  siteUrl: string | null
  description: string | null
  language: string | null
  ttlSec: number | null
}

interface NormalizedItem {
  guidHash: string
  url: string | null
  title: string
  author: string | null
  contentHtml: string | null
  publishedAt: number
  updatedAt: number | null
  enclosure: { url: string; mime: string | null; length: number | null } | null
  leadImageCandidates: string[]
  initialIsRead: boolean
}

const MONTH_SEC = 30 * 24 * 60 * 60
const ENTITY_NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    const mapped = ENTITY_NAMED[body.toLowerCase()]
    return mapped ?? match
  })
}

const BLOCK_TAGS = new Set([
  'article',
  'aside',
  'blockquote',
  'br',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
])

export function htmlToPlainTextParagraphs(html: string): string[] {
  const withBreaks = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_full, tag: string) =>
    BLOCK_TAGS.has(tag.toLowerCase()) ? '\n' : '',
  )
  return decodeEntities(withBreaks)
    .split('\n')
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0)
}

export function htmlToPlainText(html: string): string {
  return htmlToPlainTextParagraphs(html).join(' ')
}

function tryUrl(value: string, base?: string): URL | null {
  try {
    return base === undefined ? new URL(value) : new URL(value, base)
  } catch {
    return null
  }
}

function looksLikeHttpUrl(value: string): boolean {
  const url = tryUrl(value)
  return url !== null && (url.protocol === 'http:' || url.protocol === 'https:')
}

function canonicalizeUrl(url: URL, keepHash: boolean, hosts: FeedHosts): string {
  url.protocol = url.protocol.toLowerCase()
  url.hostname = url.hostname.toLowerCase()
  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = ''
  }
  if (!keepHash) {
    url.hash = ''
  }
  return cleanTrackingParams(url.toString(), hosts)
}

function resolveHttpUrl(
  raw: string | null,
  base: string | null,
  keepHash: boolean,
  hosts: FeedHosts,
): string | null {
  if (raw === null || raw.length === 0) {
    return null
  }
  const url = base === null ? tryUrl(raw) : tryUrl(raw, base)
  if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return null
  }
  return canonicalizeUrl(url, keepHash, hosts)
}

function rewriteRelativeUrls(html: string, baseUrl: string): string {
  return html.replace(
    /\b(href|src|poster)=("|'|)([^"'>\s]+)\2/gi,
    (full, attr: string, quote: string, value: string) => {
      if (value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('#')) {
        return full
      }
      const abs = tryUrl(value, baseUrl)
      if (abs === null) {
        return full
      }
      const q = quote.length > 0 ? quote : '"'
      return `${attr}=${q}${abs.toString()}${q}`
    },
  )
}

function guidSource(
  item: ParsedItem,
  url: string | null,
  publishedAt: number,
): { raw: string; asUrl: boolean } {
  if (item.guid !== null && item.guid.length > 0) {
    if (item.guidIsPermalink || looksLikeHttpUrl(item.guid)) {
      return { raw: item.guid, asUrl: true }
    }
    return { raw: item.guid, asUrl: false }
  }
  if (url !== null) {
    return { raw: url, asUrl: true }
  }
  const rfc3339 = new Date(publishedAt * 1000).toISOString()
  return { raw: `${item.title ?? ''}\u001f${rfc3339}\u001f${item.url ?? ''}`, asUrl: false }
}

function hashGuid(
  item: ParsedItem,
  url: string | null,
  publishedAt: number,
  keepHash: boolean,
  hosts: FeedHosts,
): string {
  const source = guidSource(item, url, publishedAt)
  if (source.asUrl) {
    const canonical = resolveHttpUrl(source.raw, null, keepHash, hosts)
    return sha256Hex(canonical ?? source.raw)
  }
  return sha256Hex(source.raw)
}

function enclosureFor(
  item: ParsedItem,
  contentHtml: string | null,
  baseUrl: string | null,
  keepHash: boolean,
  hosts: FeedHosts,
): { url: string; mime: string | null; length: number | null } | null {
  const first = item.enclosures[0]
  if (first === undefined) {
    return null
  }
  const abs = resolveHttpUrl(first.url, baseUrl, keepHash, hosts)
  if (abs === null) {
    return null
  }
  if (contentHtml?.includes(abs)) {
    return null
  }
  if (contentHtml?.includes(first.url)) {
    return null
  }
  return { url: abs, mime: first.mime, length: first.length }
}

function leadImageCandidates(
  item: ParsedItem,
  enclosure: { url: string; mime: string | null } | null,
  baseUrl: string | null,
  keepHash: boolean,
  hosts: FeedHosts,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string | null) => {
    if (raw === null) {
      return
    }
    const abs = resolveHttpUrl(raw, baseUrl, keepHash, hosts)
    if (abs === null || seen.has(abs)) {
      return
    }
    seen.add(abs)
    out.push(abs)
  }
  for (const thumb of item.mediaThumbnails) {
    push(thumb)
  }
  for (const media of item.mediaContents) {
    if (media.mime === null || media.mime.startsWith('image/')) {
      push(media.url)
    }
  }
  if (enclosure?.mime?.startsWith('image/')) {
    push(enclosure.url)
  }
  return out
}

function correctPublished(raw: string | null, now: number): number {
  if (raw === null) {
    return now
  }
  const parsed = parseFeedDate(raw)
  if (parsed === null || parsed <= 0 || parsed > now) {
    if (parsed === null) {
      console.log({ event: 'feed.parse', message: 'unparseable date', raw })
    }
    return now
  }
  return parsed
}

function isEmptyItem(item: ParsedItem): boolean {
  return (
    (item.title === null || item.title.trim().length === 0) &&
    (item.url === null || item.url.trim().length === 0) &&
    (item.guid === null || item.guid.trim().length === 0) &&
    (item.contentHtml === null || item.contentHtml.trim().length === 0)
  )
}

export function normalizeFeed(
  feed: ParsedFeed,
  ctx: NormalizeContext,
): { meta: NormalizedFeedMeta; items: NormalizedItem[] } {
  const feedUrlParsed = tryUrl(ctx.feedUrl)
  const feedHost = feedUrlParsed?.hostname ?? ''
  const siteResolved = resolveHttpUrl(feed.siteUrl, ctx.feedUrl, false, {
    feedHost,
    siteHost: null,
  })
  const siteHost = siteResolved !== null ? (tryUrl(siteResolved)?.hostname ?? null) : null
  const hosts = { feedHost, siteHost }
  const itemBase = siteResolved ?? ctx.feedUrl

  const prepared: NormalizedItem[] = []
  for (const item of feed.items) {
    if (isEmptyItem(item)) {
      continue
    }
    const publishedAt = correctPublished(item.publishedAt, ctx.now)
    const updatedAt = item.updatedAt !== null ? parseFeedDate(item.updatedAt) : null
    const url = resolveHttpUrl(item.url, itemBase, ctx.keepHashInUrl, hosts)
    const contentBase = url ?? siteResolved ?? ctx.feedUrl
    let contentHtml = item.contentHtml
    if (contentHtml !== null && contentHtml.length > 0) {
      contentHtml = rewriteRelativeUrls(contentHtml, contentBase)
    }
    const title = item.title !== null ? htmlToPlainText(item.title) : ''
    const enclosure = enclosureFor(item, contentHtml, contentBase, ctx.keepHashInUrl, hosts)
    const olderThanMonth = publishedAt < ctx.now - MONTH_SEC
    prepared.push({
      guidHash: hashGuid(item, url, publishedAt, ctx.keepHashInUrl, hosts),
      url,
      title,
      author: item.author,
      contentHtml,
      publishedAt,
      updatedAt,
      enclosure,
      leadImageCandidates: leadImageCandidates(
        item,
        enclosure,
        contentBase,
        ctx.keepHashInUrl,
        hosts,
      ),
      initialIsRead: olderThanMonth,
    })
  }

  prepared.sort((a, b) => {
    if (a.publishedAt !== b.publishedAt) {
      return a.publishedAt - b.publishedAt
    }
    return a.guidHash.localeCompare(b.guidHash)
  })

  if (ctx.isFirstFetch) {
    const recentIndexes: number[] = []
    for (let i = 0; i < prepared.length; i += 1) {
      const row = prepared[i]
      if (row !== undefined && !row.initialIsRead) {
        recentIndexes.push(i)
      }
    }
    const unreadStart = Math.max(0, recentIndexes.length - ctx.initialUnreadCount)
    for (let i = 0; i < unreadStart; i += 1) {
      const idx = recentIndexes[i]
      if (idx === undefined) {
        continue
      }
      const row = prepared[idx]
      if (row !== undefined) {
        row.initialIsRead = true
      }
    }
  }

  return {
    meta: {
      title:
        feed.title !== null && feed.title.length > 0 ? htmlToPlainText(feed.title) : ctx.feedUrl,
      siteUrl: siteResolved,
      description: feed.description,
      language: feed.language,
      ttlSec: feed.ttlMinutes !== null ? feed.ttlMinutes * 60 : null,
    },
    items: prepared,
  }
}

export { parseFeedDate } from './date-parser.ts'
