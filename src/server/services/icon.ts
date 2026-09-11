import { assertSafeUrl, fetchBytes } from './fetcher.ts'
import { collectLinkedUrls } from './html-scan.ts'
import { decodeUtf8Lenient } from './sniffer.ts'

const ICON_MAX_BYTES = 32 * 1024

export interface FeedIcon {
  bytes: Uint8Array
  mime: string
  sourceUrl: string
}

function extractIconHrefs(html: string, baseUrl: string): Promise<string[]> {
  return collectLinkedUrls(html, baseUrl, 'link', (attribute) => {
    const tokens = (attribute('rel') ?? '').toLowerCase().split(/\s+/)
    if (tokens.includes('icon')) {
      return 1
    }
    return tokens.includes('apple-touch-icon') ? 2 : null
  })
}

async function fetchIconBytes(
  url: string,
  deps: { fetch: typeof fetch; now: () => number },
): Promise<FeedIcon | null> {
  try {
    assertSafeUrl(new URL(url))
    const result = await fetchBytes(url, deps, { maxBytes: ICON_MAX_BYTES })
    const mime = result.contentType?.split(';')[0]?.trim().toLowerCase() ?? ''
    if (!mime.startsWith('image/')) {
      return null
    }
    if (result.body.byteLength === 0 || result.body.byteLength > ICON_MAX_BYTES) {
      return null
    }
    return { bytes: result.body, mime, sourceUrl: result.finalUrl }
  } catch {
    return null
  }
}

export async function fetchFeedIcon(
  input: { siteUrl: string | null; feedUrl: string },
  deps: { fetch: typeof fetch; now: () => number },
): Promise<FeedIcon | null> {
  const candidates: string[] = []
  if (input.siteUrl !== null) {
    try {
      const page = await fetchBytes(input.siteUrl, deps)
      const html = decodeUtf8Lenient(page.body)
      const fromHtml = await extractIconHrefs(html, page.finalUrl)
      candidates.push(...fromHtml)
      candidates.push(new URL('/favicon.ico', page.finalUrl).toString())
    } catch {
      try {
        candidates.push(new URL('/favicon.ico', input.siteUrl).toString())
      } catch {
        // 組み立てられないURLは候補にしない
      }
    }
  }
  try {
    candidates.push(new URL('/favicon.ico', input.feedUrl).toString())
  } catch {
    // 組み立てられないURLは候補にしない
  }
  const seen = new Set<string>()
  for (const url of candidates) {
    if (seen.has(url)) {
      continue
    }
    seen.add(url)
    const icon = await fetchIconBytes(url, deps)
    if (icon !== null) {
      return icon
    }
  }
  return null
}
