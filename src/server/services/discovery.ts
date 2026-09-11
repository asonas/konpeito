import { mapWithConcurrency } from '../lib/pool.ts'
import { parseFeedDate } from './date-parser.ts'
import { assertSafeUrl, fetchFeed, UnsafeUrlError } from './fetcher.ts'
import { collectLinkedUrls } from './html-scan.ts'
import { parseFeed } from './parser/adapter.ts'
import { type FeedErrorKind, type FeedFormat, FeedParseError } from './parser/types.ts'
import { decodeFeedBody, decodeUtf8Lenient, sniffFormat } from './sniffer.ts'

const KNOWN_PATHS = [
  '/feed',
  '/feed/',
  '/rss',
  '/rss.xml',
  '/feed.xml',
  '/atom.xml',
  '/index.xml',
  '/index.rss',
  '/atom',
  '/feed.atom',
  '/feed.json',
  '/rss/index.xml',
  '/.rss',
  '/?feed=rss2',
]

const NESTED_PATHS = ['feed', 'feed/', 'rss', 'rss.xml', 'feed.xml', 'atom.xml', 'index.xml']

/**
 * `<link>`のtypeとrel
 * フィードを`text/xml`や`application/xml`で配信するサイトがあるので広めに拾い、
 * フィードかどうかは実際に解析して確かめる
 */
const FEED_TYPES = new Set([
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
  'application/rdf+xml',
  'application/xml',
  'text/xml',
  'application/json',
])
const FEED_RELS = new Set(['alternate', 'feed'])

const MAX_ANCHORS = 5
const PROBE_CONCURRENCY = 4

export interface FeedCandidate {
  url: string
  title: string | null
  subscribedFeedId: number | null
  format: FeedFormat | null
  itemCount: number
  latestItemAt: number | null
  comments: boolean
}

export interface DiscoverFailure {
  errorKind: FeedErrorKind
  status: number | null
}

export interface DiscoverResult {
  alreadySubscribedFeedId: number | null
  candidates: FeedCandidate[]
  failure: DiscoverFailure | null
}

interface Deps {
  fetch: typeof fetch
  now: () => number
}

export function normalizeFeedUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    parsed.hostname = parsed.hostname.toLowerCase()
    parsed.protocol = parsed.protocol.toLowerCase()
    if (
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    ) {
      parsed.port = ''
    }
    return parsed.toString()
  } catch {
    return url
  }
}

export function findSubscribedFeedId(
  url: string,
  subscribedByUrl: ReadonlyMap<string, number>,
): number | null {
  const id = subscribedByUrl.get(url) ?? subscribedByUrl.get(normalizeFeedUrl(url))
  return id === undefined ? null : id
}

interface FetchedPage {
  body: Uint8Array
  contentType: string | null
  finalUrl: string
}

interface ParsedProbe {
  url: string
  title: string | null
  format: FeedFormat
  itemCount: number
  latestItemAt: number | null
}

type ParseAttempt =
  | ({ ok: true } & ParsedProbe)
  | { ok: false; failure: DiscoverFailure; page: FetchedPage | null }

function latestItemDate(
  items: { publishedAt: string | null; updatedAt: string | null }[],
): number | null {
  let latest: number | null = null
  for (const item of items) {
    const raw = item.publishedAt ?? item.updatedAt
    if (raw === null) {
      continue
    }
    const parsed = parseFeedDate(raw)
    if (parsed !== null && (latest === null || parsed > latest)) {
      latest = parsed
    }
  }
  return latest
}

function isCommentsFeed(url: string, title: string | null): boolean {
  const lower = url.toLowerCase()
  if (
    lower.includes('/comments/feed') ||
    lower.includes('comments-rss') ||
    lower.includes('feed=comments')
  ) {
    return true
  }
  if (title === null) {
    return false
  }
  const name = title.toLowerCase()
  return name.includes('comments on') || name.includes('コメント')
}

async function tryParseBody(url: string, deps: Deps): Promise<ParseAttempt> {
  const outcome = await fetchFeed(
    { url, etag: null, lastModified: null, bodyHash: null, noCache: true, force: true },
    deps,
  )
  if (outcome.kind !== 'ok') {
    const errorKind: FeedErrorKind = outcome.kind === 'error' ? outcome.errorKind : 'network'
    const status = outcome.kind === 'error' ? outcome.status : null
    console.log({ event: 'discover.skip', url, reason: errorKind, status })
    return { ok: false, failure: { errorKind, status }, page: null }
  }
  const format = sniffFormat(outcome.body)
  if (format === null) {
    console.log({
      event: 'discover.skip',
      url,
      reason: 'not_feed',
      content_type: outcome.contentType,
    })
    return {
      ok: false,
      failure: { errorKind: 'unsupported_format', status: null },
      page: { body: outcome.body, contentType: outcome.contentType, finalUrl: outcome.finalUrl },
    }
  }
  try {
    const parsed = parseFeed(decodeFeedBody(outcome.body, outcome.contentType, format), format)
    return {
      ok: true,
      url: outcome.finalUrl,
      title: parsed.title,
      format,
      itemCount: parsed.items.length,
      latestItemAt: latestItemDate(parsed.items),
    }
  } catch (error) {
    if (error instanceof FeedParseError) {
      console.log({ event: 'discover.skip', url, reason: 'parse_failed', message: error.message })
      return { ok: false, failure: { errorKind: 'parse_error', status: null }, page: null }
    }
    throw error
  }
}

function extractAlternateLinks(html: string, baseUrl: string): Promise<string[]> {
  return collectLinkedUrls(html, baseUrl, 'link', (attribute) => {
    const rels = (attribute('rel') ?? '').toLowerCase().split(/\s+/)
    if (!rels.some((value) => FEED_RELS.has(value))) {
      return null
    }
    const type = (attribute('type') ?? '').toLowerCase().split(';')[0]?.trim() ?? ''
    return FEED_TYPES.has(type) ? 0 : null
  })
}

function extractFeedAnchors(html: string, baseUrl: string): Promise<string[]> {
  return collectLinkedUrls(html, baseUrl, 'a', (attribute) => {
    const lower = (attribute('href') ?? '').toLowerCase()
    const looksLikeFeed = lower.includes('feed') || lower.includes('rss') || lower.includes('atom')
    return looksLikeFeed ? 0 : null
  })
}

function serviceCandidates(page: URL): string[] {
  const host = page.hostname.toLowerCase().replace(/^www\./, '')
  const segments = page.pathname.split('/').filter((segment) => segment.length > 0)
  const first = segments[0]
  const second = segments[1]
  const origin = page.origin

  if (host === 'youtube.com') {
    if (first === 'channel' && second !== undefined) {
      return [`https://www.youtube.com/feeds/videos.xml?channel_id=${second}`]
    }
    if (first === 'playlist') {
      const list = page.searchParams.get('list')
      return list === null ? [] : [`https://www.youtube.com/feeds/videos.xml?playlist_id=${list}`]
    }
    return []
  }
  if (host === 'github.com' && first !== undefined) {
    if (second !== undefined) {
      return [
        `https://github.com/${first}/${second}/releases.atom`,
        `https://github.com/${first}/${second}/commits.atom`,
        `https://github.com/${first}/${second}/tags.atom`,
      ]
    }
    return [`https://github.com/${first}.atom`]
  }
  if (host === 'note.com' && first !== undefined) {
    return [`https://note.com/${first}/rss`]
  }
  if (host === 'zenn.dev' && first !== undefined) {
    if (first === 'topics' && second !== undefined) {
      return [`https://zenn.dev/topics/${second}/feed`]
    }
    return [`https://zenn.dev/${first}/feed`]
  }
  if (host === 'qiita.com' && first !== undefined) {
    return [`https://qiita.com/${first}/feed`]
  }
  if (host === 'speakerdeck.com' && first !== undefined) {
    return [`https://speakerdeck.com/${first}.atom`]
  }
  if (host === 'medium.com' && first !== undefined && first.startsWith('@')) {
    return [`https://medium.com/feed/${first}`]
  }
  if (host === 'reddit.com' && first === 'r' && second !== undefined) {
    return [`https://www.reddit.com/r/${second}/.rss`]
  }
  if (host === 'scrapbox.io' && first !== undefined) {
    return [`https://scrapbox.io/api/feed/${first}`]
  }
  if (
    host.endsWith('.hatenablog.com') ||
    host.endsWith('.hatenablog.jp') ||
    host.endsWith('.hateblo.jp') ||
    host.endsWith('.hatenadiary.com') ||
    host.endsWith('.hatenadiary.jp') ||
    host.endsWith('.substack.com') ||
    host.endsWith('.tumblr.com')
  ) {
    return [`${origin}/feed`, `${origin}/rss`]
  }
  return []
}

function knownPathCandidates(page: URL): string[] {
  const urls = KNOWN_PATHS.map((path) => new URL(path, page.origin).toString())
  const segments = page.pathname.split('/').filter((segment) => segment.length > 0)
  const last = segments[segments.length - 1]
  const directories = last?.includes('.') === true ? segments.slice(0, -1) : segments.slice()
  if (directories.length > 0) {
    const base = `${page.origin}/${directories.join('/')}/`
    for (const path of NESTED_PATHS) {
      urls.push(new URL(path, base).toString())
    }
  }
  return urls
}

export async function discoverFeeds(
  inputUrl: string,
  deps: {
    fetch: typeof fetch
    now: () => number
    subscribedByUrl: ReadonlyMap<string, number>
  },
): Promise<DiscoverResult> {
  let start: URL
  try {
    start = new URL(inputUrl)
    assertSafeUrl(start)
  } catch (error) {
    const errorKind: FeedErrorKind = error instanceof UnsafeUrlError ? 'ssrf_blocked' : 'network'
    return { alreadySubscribedFeedId: null, candidates: [], failure: { errorKind, status: null } }
  }

  const subscribed = findSubscribedFeedId(start.toString(), deps.subscribedByUrl)
  if (subscribed !== null) {
    return {
      alreadySubscribedFeedId: subscribed,
      candidates: [
        {
          url: start.toString(),
          title: null,
          subscribedFeedId: subscribed,
          format: null,
          itemCount: 0,
          latestItemAt: null,
          comments: false,
        },
      ],
      failure: null,
    }
  }

  const seen = new Set<string>()
  const candidates: FeedCandidate[] = []
  const add = (probe: ParsedProbe) => {
    const key = normalizeFeedUrl(probe.url)
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    candidates.push({
      url: probe.url,
      title: probe.title,
      subscribedFeedId: findSubscribedFeedId(probe.url, deps.subscribedByUrl),
      format: probe.format,
      itemCount: probe.itemCount,
      latestItemAt: probe.latestItemAt,
      comments: isCommentsFeed(probe.url, probe.title),
    })
  }
  const finish = (failure: DiscoverFailure | null): DiscoverResult => ({
    alreadySubscribedFeedId: null,
    candidates: candidates
      .slice()
      .sort((left, right) => Number(left.comments) - Number(right.comments)),
    failure: candidates.length > 0 ? null : failure,
  })
  const stage = async (urls: string[]): Promise<boolean> => {
    const targets: string[] = []
    const queued = new Set<string>()
    for (const url of urls) {
      const key = normalizeFeedUrl(url)
      if (key === normalizeFeedUrl(start.toString()) || seen.has(key) || queued.has(key)) {
        continue
      }
      queued.add(key)
      targets.push(url)
    }
    const before = candidates.length
    const attempts = await mapWithConcurrency(targets, PROBE_CONCURRENCY, (url) =>
      tryParseBody(url, deps),
    )
    for (const attempt of attempts) {
      if (attempt?.ok === true) {
        add(attempt)
      }
    }
    return candidates.length > before
  }

  const direct = await tryParseBody(start.toString(), deps)
  if (direct.ok) {
    add(direct)
    return finish(null)
  }
  const directFailure = direct.failure
  // 取得自体に失敗したなら同じURLを叩き直しても変わらないが、
  // ホストの規則で決まるフィード（HTMLを拒むサービスもある）だけは試す価値がある
  if (direct.page === null) {
    await stage(serviceCandidates(start))
    return finish(directFailure)
  }

  const notFound: DiscoverFailure = { errorKind: 'unsupported_format', status: null }
  const html = decodeUtf8Lenient(direct.page.body)
  const base = direct.page.finalUrl
  let page: URL
  try {
    page = new URL(base)
  } catch {
    page = start
  }

  if (await stage(await extractAlternateLinks(html, base))) {
    return finish(null)
  }
  if (await stage(serviceCandidates(page))) {
    return finish(null)
  }
  if (await stage(knownPathCandidates(page))) {
    return finish(null)
  }
  await stage((await extractFeedAnchors(html, base)).slice(0, MAX_ANCHORS))
  return finish(notFound)
}
