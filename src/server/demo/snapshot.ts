import type { FeedForClient } from '../lib/client-shape.ts'
import { sha256Hex } from '../lib/crypto.ts'
import { imageProxyUrl } from '../lib/image-proxy.ts'
import { hostOf } from '../lib/url.ts'
import { fetchFeed } from '../services/fetcher.ts'
import { fetchFeedIcon } from '../services/icon.ts'
import { htmlToPlainText, normalizeFeed } from '../services/normalizer.ts'
import { parseFeed } from '../services/parser/adapter.ts'
import { FeedParseError } from '../services/parser/types.ts'
import { sanitizeContent } from '../services/sanitizer/index.ts'
import { decodeFeedBody, sniffFormat } from '../services/sniffer.ts'
import type { DemoFeedConfig } from './config.ts'

const ITEMS_PER_FEED = 20
/** Workersの同時待ち接続は6本。フィード取得とアイコン取得が重なっても枠を超えないようにする */
const BUILD_CONCURRENCY = 4
const FRESH_FOR_SEC = 30 * 60
/** これを過ぎたら裏ではなく、このリクエストで作り直す。waitUntilは応答後30秒で切れる */
const REBUILD_INLINE_AFTER_SEC = 2 * 60 * 60
const CACHE_MAX_AGE_SEC = 24 * 60 * 60
const CACHE_NAME = 'konpeito-demo'

export type DemoFeed = Omit<FeedForClient, 'icon_url'> & {
  language: string | null
  icon_query: string | null
}

interface DemoTag {
  id: number
  name: string
  sort_index: number
  created_at: number
  public_id: string | null
}

export interface DemoItem {
  id: number
  feed_id: number
  title: string
  url: string | null
  author: string | null
  summary: string | null
  lead_image_url: string | null
  content_html: string | null
  enclosure_url: string | null
  enclosure_mime: string | null
  enclosure_length: number | null
  published_at: number
  updated_at: number | null
  language: string | null
  search_text: string
}

export interface DemoSnapshot {
  built_at: number
  feeds: DemoFeed[]
  tags: DemoTag[]
  items: DemoItem[]
}

/**
 * 記事のIDは`guid`から決定的に導く。スナップショットを作り直しても同じ記事は同じIDになるので、
 * 開いたままのタブが指すURLが、裏での作り直しをまたいでも生き続ける。
 */
function itemIdOf(feedId: number, guidHash: string): number {
  const hex = sha256Hex(`${feedId}:${guidHash}`).slice(0, 12)
  const id = Number.parseInt(hex, 16)
  return Number.isSafeInteger(id) && id > 0 ? id : 1
}

function collectTags(configs: DemoFeedConfig[], now: number): DemoTag[] {
  const names: string[] = []
  for (const config of configs) {
    for (const name of config.tags) {
      if (!names.includes(name)) {
        names.push(name)
      }
    }
  }
  return names.map((name, index) => ({
    id: index + 1,
    name,
    sort_index: index,
    created_at: now,
    public_id: null,
  }))
}

function errorFeed(
  config: DemoFeedConfig,
  id: number,
  tags: { id: number; name: string }[],
  now: number,
  errorKind: string,
  message: string,
): { feed: DemoFeed; items: DemoItem[] } {
  return {
    feed: {
      id,
      title: config.title ?? config.url,
      custom_title: config.title ?? null,
      feed_url: config.url,
      site_url: null,
      language: null,
      fetch_full_content: 0,
      show_lead_image: 1,
      disabled: 0,
      disabled_reason: null,
      last_error_kind: errorKind,
      last_error: message,
      last_fetch_at: now,
      unread_count: 0,
      public_id: null,
      tags,
      icon_query: null,
    },
    items: [],
  }
}

async function buildFeed(
  config: DemoFeedConfig,
  id: number,
  tags: { id: number; name: string }[],
  imageProxy: (url: string) => string,
  now: number,
): Promise<{ feed: DemoFeed; items: DemoItem[] }> {
  const deps = { fetch: globalThis.fetch, now: () => now }
  const fetched = await fetchFeed(
    { url: config.url, etag: null, lastModified: null, bodyHash: null, noCache: true, force: true },
    deps,
  )
  if (fetched.kind !== 'ok') {
    const errorKind = fetched.kind === 'error' ? fetched.errorKind : 'network'
    const message = fetched.kind === 'error' ? fetched.message : 'no body'
    return errorFeed(config, id, tags, now, errorKind, message)
  }
  const format = sniffFormat(fetched.body)
  if (format === null) {
    return errorFeed(config, id, tags, now, 'unsupported_format', 'unsupported feed format')
  }
  let parsed: ReturnType<typeof parseFeed>
  try {
    parsed = parseFeed(decodeFeedBody(fetched.body, fetched.contentType, format), format)
  } catch (error) {
    const message = error instanceof FeedParseError ? error.message : 'parse failed'
    return errorFeed(config, id, tags, now, 'parse_error', message)
  }

  const normalized = normalizeFeed(parsed, {
    feedUrl: fetched.finalUrl,
    keepHashInUrl: false,
    now,
    isFirstFetch: true,
    initialUnreadCount: ITEMS_PER_FEED,
  })

  const feedHost = hostOf(fetched.finalUrl) ?? hostOf(config.url) ?? ''
  const siteHost = normalized.meta.siteUrl !== null ? hostOf(normalized.meta.siteUrl) : null
  const items: DemoItem[] = []
  for (const item of normalized.items.slice(0, ITEMS_PER_FEED)) {
    const baseUrl = item.url ?? normalized.meta.siteUrl ?? fetched.finalUrl
    const sanitized = sanitizeContent(item.contentHtml ?? '', {
      baseUrl,
      feedHost,
      siteHost,
      imageProxy,
      language: normalized.meta.language,
    })
    let lead = sanitized.leadImageUrl
    if (lead === null) {
      const candidate = item.leadImageCandidates[0]
      if (candidate !== undefined) {
        lead = imageProxy(candidate)
      }
    }
    items.push({
      id: itemIdOf(id, item.guidHash),
      feed_id: id,
      title: item.title,
      url: item.url,
      author: item.author,
      summary: sanitized.summary,
      lead_image_url: lead,
      content_html: sanitized.html,
      enclosure_url: item.enclosure?.url ?? null,
      enclosure_mime: item.enclosure?.mime ?? null,
      enclosure_length: item.enclosure?.length ?? null,
      published_at: item.publishedAt,
      updated_at: item.updatedAt,
      language: normalized.meta.language,
      search_text: `${item.title}\n${htmlToPlainText(sanitized.html)}`.toLowerCase(),
    })
  }

  const icon = await fetchFeedIcon(
    { siteUrl: normalized.meta.siteUrl, feedUrl: fetched.finalUrl },
    deps,
  )
  return {
    feed: {
      id,
      title: normalized.meta.title,
      custom_title: config.title ?? null,
      feed_url: config.url,
      site_url: normalized.meta.siteUrl,
      language: normalized.meta.language,
      fetch_full_content: 0,
      show_lead_image: 1,
      disabled: 0,
      disabled_reason: null,
      last_error_kind: null,
      last_error: null,
      last_fetch_at: now,
      unread_count: items.length,
      public_id: null,
      tags,
      icon_query: icon === null ? null : imageProxy(icon.sourceUrl).slice('/img'.length),
    },
    items,
  }
}

async function buildSnapshot(
  configs: DemoFeedConfig[],
  imageProxyKey: string,
  now: number,
): Promise<DemoSnapshot> {
  const tags = collectTags(configs, now)
  const imageProxy = imageProxyUrl(imageProxyKey)
  const built = await mapPool(configs, BUILD_CONCURRENCY, (config, index) =>
    buildFeed(
      config,
      index + 1,
      tags
        .filter((tag) => config.tags.includes(tag.name))
        .map((tag) => ({ id: tag.id, name: tag.name })),
      imageProxy,
      now,
    ),
  )
  const items = built
    .flatMap((entry) => entry.items)
    .sort((a, b) => b.published_at - a.published_at)
  return { built_at: now, feeds: built.map((entry) => entry.feed), tags, items }
}

function isSnapshot(value: unknown): value is DemoSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<DemoSnapshot>
  return (
    typeof candidate.built_at === 'number' &&
    Array.isArray(candidate.feeds) &&
    Array.isArray(candidate.tags) &&
    Array.isArray(candidate.items)
  )
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const index = next
      next += 1
      const item = items[index]
      if (item === undefined) {
        return
      }
      out[index] = await fn(item, index)
    }
  }
  const workers = Math.min(Math.max(limit, 1), items.length)
  if (workers === 0) {
    return out
  }
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return out
}

function cacheKeyOf(configs: DemoFeedConfig[]): string {
  const digest = sha256Hex(JSON.stringify(configs)).slice(0, 16)
  return `https://demo.konpeito.invalid/snapshot/v1/${digest}`
}

function openCache(): Promise<Cache> {
  return caches.open(CACHE_NAME)
}

async function readCache(key: string): Promise<DemoSnapshot | null> {
  const response = await (await openCache()).match(key)
  if (response === undefined) {
    return null
  }
  try {
    const parsed = await response.json()
    return isSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function writeCache(key: string, snapshot: DemoSnapshot): Promise<void> {
  await (await openCache()).put(
    key,
    new Response(JSON.stringify(snapshot), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${CACHE_MAX_AGE_SEC}`,
      },
    }),
  )
}

/** 同じアイソレートの中で取得が重ならないようにする。コロケーションをまたぐ重複までは防がない */
let inflight: Promise<DemoSnapshot> | undefined

function rebuild(configs: DemoFeedConfig[], imageProxyKey: string, now: number, key: string) {
  inflight ??= buildSnapshot(configs, imageProxyKey, now)
    .then(async (snapshot) => {
      await writeCache(key, snapshot)
      return snapshot
    })
    .finally(() => {
      inflight = undefined
    })
  return inflight
}

export function refreshSnapshot(configs: DemoFeedConfig[], imageProxyKey: string, now: number) {
  return rebuild(configs, imageProxyKey, now, cacheKeyOf(configs))
}

export async function loadSnapshot(
  configs: DemoFeedConfig[],
  imageProxyKey: string,
  ctx: { waitUntil: (promise: Promise<unknown>) => void },
  now: number,
): Promise<DemoSnapshot> {
  const key = cacheKeyOf(configs)
  const cached = await readCache(key)
  if (cached === null) {
    return rebuild(configs, imageProxyKey, now, key)
  }
  const age = now - cached.built_at
  if (age > REBUILD_INLINE_AFTER_SEC) {
    return rebuild(configs, imageProxyKey, now, key)
  }
  if (age > FRESH_FOR_SEC) {
    ctx.waitUntil(rebuild(configs, imageProxyKey, now, key))
  }
  return cached
}
