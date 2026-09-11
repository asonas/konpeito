import { z } from 'zod'
import { nowSec } from '../lib/crypto.ts'
import { imageProxyUrl } from '../lib/image-proxy.ts'
import { fetchBytes, UnsafeUrlError } from './fetcher.ts'
import { sanitizeContent } from './sanitizer/index.ts'
import { charsetFromContentType, decodeUtf8Lenient, decodeWithLabel } from './sniffer.ts'

/**
 * 記事ページ向けヘッダー。フィード用のAcceptを送るとHTMLではなくフィードや406を返すサイトがあり、
 * フィード用のUser-Agentのままだと簡略版や拒否応答を受けるサイトがある
 */
const ARTICLE_HEADERS: Readonly<Record<string, string>> = {
  'User-Agent': 'Mozilla/5.0 (compatible; konpeito/1.0; +https://github.com/shikakun/konpeito)',
  Accept: 'text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8',
}

/** 記事ページはフィードより重く、応答に10秒以上かかるサイトが実在する */
const ARTICLE_TIMEOUT_MS = 20_000

export type FullContentFailure =
  | 'no_url'
  | 'ssrf_blocked'
  | 'timeout'
  | 'too_large'
  | 'network'
  | 'not_html'
  | 'extract'
  | `http_${number}`

type FetchArticleResult =
  | { kind: 'ok'; html: string; finalUrl: string }
  | { kind: 'failed'; reason: FullContentFailure }

function charsetFromMeta(head: string): string | null {
  const match = /<meta[^>]+charset\s*=\s*["']?\s*([a-z0-9_:.-]+)/i.exec(head)
  return match?.[1] ?? null
}

/**
 * デコード順。UTF-8を厳密に試し、失敗したら`Content-Type`、`meta`、最後に非厳密なUTF-8で読む
 * Shift_JISとEUC-JPのページが今も残っており、UTF-8決め打ちでは文字化けした本文が保存される
 */
export function decodeHtml(body: Uint8Array, contentType: string | null): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    const head = new TextDecoder('iso-8859-1').decode(body.subarray(0, 4096))
    const label = charsetFromContentType(contentType) ?? charsetFromMeta(head)
    const decoded = label === null ? null : decodeWithLabel(body, label)
    return decoded ?? decodeUtf8Lenient(body)
  }
}

function looksLikeHtml(contentType: string | null, body: Uint8Array): boolean {
  const media = contentType?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (media.includes('html') || media.includes('xml')) {
    return true
  }
  if (media.length > 0 && !media.startsWith('text/')) {
    return false
  }
  const head = decodeUtf8Lenient(body, 512).trimStart().toLowerCase()
  return head.startsWith('<')
}

function failureOf(error: unknown): FullContentFailure {
  if (error instanceof UnsafeUrlError) {
    return 'ssrf_blocked'
  }
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return 'timeout'
    }
    const http = /^HTTP (\d{3})$/.exec(error.message)
    if (http?.[1] !== undefined) {
      return `http_${Number(http[1])}`
    }
    if (error.message === 'too_large') {
      return 'too_large'
    }
  }
  return 'network'
}

export async function fetchArticleHtml(
  url: string,
  deps: { fetch: typeof fetch; now: () => number },
): Promise<FetchArticleResult> {
  try {
    const page = await fetchBytes(url, deps, {
      timeoutMs: ARTICLE_TIMEOUT_MS,
      headers: ARTICLE_HEADERS,
    })
    if (!looksLikeHtml(page.contentType, page.body)) {
      return { kind: 'failed', reason: 'not_html' }
    }
    return { kind: 'ok', html: decodeHtml(page.body, page.contentType), finalUrl: page.finalUrl }
  } catch (error) {
    return { kind: 'failed', reason: failureOf(error) }
  }
}

/**
 * Readabilityは段落のポイントにカンマの数を使うが、デフォルトの正規表現に日本語の読点`、`がない
 * デフォルトのカンマ類に`、`（U+3001）を加える
 */
export const COMMAS_WITH_JAPANESE =
  /\u002C|\u060C|\uFE50|\uFE10|\uFE11|\u2E41|\u2E34|\u2E32|\uFF0C|\u3001/g

interface ReadabilityInternals {
  REGEXPS: Readonly<Record<string, RegExp>>
}

function hasRegexps(value: object): value is ReadabilityInternals {
  return 'REGEXPS' in value && typeof value.REGEXPS === 'object' && value.REGEXPS !== null
}

function applyJapaneseCommas(reader: object): void {
  if (hasRegexps(reader)) {
    Object.defineProperty(reader, 'REGEXPS', {
      value: { ...reader.REGEXPS, commas: COMMAS_WITH_JAPANESE },
      configurable: true,
      writable: true,
    })
  }
}

export async function extractFromHtml(html: string, url: string): Promise<string | null> {
  const { parseHTML } = await import('linkedom')
  const { Readability } = await import('@mozilla/readability')
  try {
    const window = parseHTML(html)
    const { document } = window
    if (typeof document !== 'object' || document === null) {
      return null
    }
    Object.defineProperty(document, 'URL', { value: url, configurable: true })
    if (!isDocument(document)) {
      return null
    }
    const reader = new Readability(document)
    applyJapaneseCommas(reader)
    const article = reader.parse()
    if (article === null) {
      return null
    }
    const content = article.content
    if (typeof content !== 'string' || content.length === 0) {
      return null
    }
    return content
  } catch {
    return null
  }
}

function isDocument(value: object): value is Document {
  return 'querySelector' in value && 'body' in value && 'documentElement' in value
}

const itemRowSchema = z.object({
  id: z.number().int(),
  url: z.string().nullable(),
  full_content_html: z.string().nullable(),
  feed_id: z.number().int(),
  language: z.string().nullable(),
  feed_url: z.string(),
  site_url: z.string().nullable(),
})

type ExtractFullContentResult =
  | { kind: 'ok'; html: string }
  | { kind: 'cached'; html: string }
  | { kind: 'failed'; reason: FullContentFailure }

function failed(itemId: number, reason: FullContentFailure): ExtractFullContentResult {
  console.log({ event: 'full_content.fail', item_id: itemId, reason })
  return { kind: 'failed', reason }
}

export async function extractFullContent(
  env: Env,
  itemId: number,
  force: boolean,
): Promise<ExtractFullContentResult> {
  const row = await env.DB.prepare(
    `SELECT items.id, items.url, items.full_content_html, items.feed_id,
            feeds.language, feeds.feed_url, feeds.site_url
     FROM items JOIN feeds ON feeds.id = items.feed_id
     WHERE items.id = ?`,
  )
    .bind(itemId)
    .first()
  const parsed = itemRowSchema.safeParse(row)
  if (!parsed.success || parsed.data.url === null) {
    return failed(itemId, 'no_url')
  }
  if (!force && parsed.data.full_content_html !== null) {
    return { kind: 'cached', html: parsed.data.full_content_html }
  }
  const page = await fetchArticleHtml(parsed.data.url, { fetch: globalThis.fetch, now: nowSec })
  if (page.kind === 'failed') {
    return failed(itemId, page.reason)
  }
  try {
    const extracted = await extractFromHtml(page.html, page.finalUrl)
    if (extracted === null) {
      return failed(itemId, 'extract')
    }
    const feedHost = new URL(parsed.data.feed_url).hostname
    const siteHost = parsed.data.site_url !== null ? new URL(parsed.data.site_url).hostname : null
    const sanitized = sanitizeContent(extracted, {
      baseUrl: page.finalUrl,
      feedHost,
      siteHost,
      imageProxy: imageProxyUrl(env.IMAGE_PROXY_KEY),
      language: parsed.data.language,
    })
    return { kind: 'ok', html: sanitized.html }
  } catch {
    return failed(itemId, 'extract')
  }
}

export async function saveFullContent(env: Env, itemId: number, html: string): Promise<void> {
  await env.DB.prepare(
    'UPDATE items SET full_content_html = ?, full_content_fetched_at = ? WHERE id = ?',
  )
    .bind(html, nowSec(), itemId)
    .run()
}
