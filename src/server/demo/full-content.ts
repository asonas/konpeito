import { imageProxyUrl } from '../lib/image-proxy.ts'
import {
  extractFromHtml,
  type FullContentFailure,
  fetchArticleHtml,
} from '../services/extractor.ts'
import { sanitizeContent } from '../services/sanitizer/index.ts'
import type { DemoFeed, DemoItem } from './snapshot.ts'

const CACHE_NAME = 'konpeito-demo'
const CACHE_MAX_AGE_SEC = 24 * 60 * 60

type DemoFullContentResult =
  | { kind: 'ok'; html: string }
  | { kind: 'failed'; reason: FullContentFailure }

function cacheKeyOf(itemId: number): string {
  return `https://demo.konpeito.invalid/full-content/v1/${itemId}`
}

function openCache(): Promise<Cache> {
  return caches.open(CACHE_NAME)
}

export async function peekFullContent(itemId: number): Promise<string | null> {
  const response = await (await openCache()).match(cacheKeyOf(itemId))
  if (response === undefined) {
    return null
  }
  try {
    return await response.text()
  } catch {
    return null
  }
}

async function writeCache(itemId: number, html: string): Promise<void> {
  await (await openCache()).put(
    cacheKeyOf(itemId),
    new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': `max-age=${CACHE_MAX_AGE_SEC}`,
      },
    }),
  )
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

export async function loadFullContent(
  item: DemoItem,
  feed: DemoFeed,
  imageProxyKey: string,
  now: number,
): Promise<DemoFullContentResult> {
  if (item.url === null) {
    return { kind: 'failed', reason: 'no_url' }
  }
  const cached = await peekFullContent(item.id)
  if (cached !== null) {
    return { kind: 'ok', html: cached }
  }
  const page = await fetchArticleHtml(item.url, { fetch: globalThis.fetch, now: () => now })
  if (page.kind === 'failed') {
    console.log({ event: 'demo.full_content.fail', item_id: item.id, reason: page.reason })
    return { kind: 'failed', reason: page.reason }
  }
  try {
    const extracted = await extractFromHtml(page.html, page.finalUrl)
    if (extracted === null) {
      console.log({ event: 'demo.full_content.fail', item_id: item.id, reason: 'extract' })
      return { kind: 'failed', reason: 'extract' }
    }
    const sanitized = sanitizeContent(extracted, {
      baseUrl: page.finalUrl,
      feedHost: hostOf(feed.feed_url) ?? '',
      siteHost: feed.site_url === null ? null : hostOf(feed.site_url),
      imageProxy: imageProxyUrl(imageProxyKey),
      language: feed.language,
    })
    await writeCache(item.id, sanitized.html)
    return { kind: 'ok', html: sanitized.html }
  } catch {
    console.log({ event: 'demo.full_content.fail', item_id: item.id, reason: 'extract' })
    return { kind: 'failed', reason: 'extract' }
  }
}
