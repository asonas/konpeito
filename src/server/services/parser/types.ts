export type FeedErrorKind =
  | 'timeout'
  | 'network'
  | 'http_5xx'
  | 'rate_limited'
  | 'cf_challenge'
  | 'forbidden'
  | 'not_found'
  | 'gone'
  | 'http_4xx'
  | 'too_large'
  | 'empty_body'
  | 'unsupported_format'
  | 'parse_error'
  | 'ssrf_blocked'
  | 'redirect_loop'

export const TRANSIENT_ERRORS: ReadonlySet<FeedErrorKind> = new Set([
  'timeout',
  'network',
  'http_5xx',
  'rate_limited',
])

export type FeedFormat = 'rss' | 'rdf' | 'atom' | 'jsonfeed'

export interface ParsedFeed {
  title: string | null
  siteUrl: string | null
  description: string | null
  language: string | null
  ttlMinutes: number | null
  items: ParsedItem[]
}

export interface ParsedItem {
  guid: string | null
  guidIsPermalink: boolean
  url: string | null
  title: string | null
  author: string | null
  contentHtml: string | null
  summaryText: string | null
  publishedAt: string | null
  updatedAt: string | null
  enclosures: { url: string; mime: string | null; length: number | null }[]
  mediaThumbnails: string[]
  mediaContents: { url: string; mime: string | null }[]
}

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedParseError'
  }
}
