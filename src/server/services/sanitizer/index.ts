import { NodeFilter, parseHTML } from 'linkedom'
import { IFRAME_HOSTS } from '../../../shared/sanitize-policy.ts'
import { htmlToPlainText } from '../normalizer.ts'
import type { FeedHosts } from '../url-cleaner.ts'
import { cleanTrackingParams } from '../url-cleaner.ts'
import { replaceEmbeds } from './embed.ts'
import { applyAllowlist, decorateMediaAndLinks, normalizeHeadings } from './headings.ts'
import {
  isAllowedDataUrl,
  isHttpUrl,
  isMailto,
  plaintextHtml,
  truncateChars,
  tryParseUrl,
  wrapFragment,
} from './html.ts'
import { restoreLazyImages } from './lazy-image.ts'
import { removeTracking } from './tracking.ts'

interface SanitizeContext extends FeedHosts {
  baseUrl: string
  imageProxy: (url: string) => string
  language: string | null
}

interface SanitizeResult {
  html: string
  summary: string
  leadImageUrl: string | null
  textLength: number
}

function hasDocument(value: object): value is { document: Document } {
  return Reflect.get(value, 'document') !== undefined
}

function fallbackResult(html: string): SanitizeResult {
  const text = htmlToPlainText(html)
  return {
    html: plaintextHtml(html),
    summary: truncateChars(text, 256),
    leadImageUrl: null,
    textLength: text.length,
  }
}

function rewriteSrcset(
  srcset: string,
  baseUrl: string,
  imageProxy: (url: string) => string,
): string {
  const parts = srcset
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  const rewritten: string[] = []
  for (const part of parts) {
    const match = /^(\S+)(\s+.+)?$/.exec(part)
    const urlPart = match?.[1]
    if (match === null || urlPart === undefined) {
      rewritten.push(part)
      continue
    }
    const desc = match[2] ?? ''
    if (isAllowedDataUrl(urlPart) || isMailto(urlPart)) {
      rewritten.push(part)
      continue
    }
    const abs = tryParseUrl(urlPart, baseUrl)
    if (abs === null || !isHttpUrl(abs)) {
      rewritten.push(part)
      continue
    }
    rewritten.push(`${imageProxy(abs.toString())}${desc}`)
  }
  return rewritten.join(', ')
}

function absolutizeUrls(document: Document, baseUrl: string, hosts: FeedHosts): void {
  const urlAttrs = ['href', 'src', 'poster', 'cite']
  for (const el of [...document.querySelectorAll('*')]) {
    for (const attr of urlAttrs) {
      const value = el.getAttribute(attr)
      if (value === null || value.length === 0 || isAllowedDataUrl(value) || isMailto(value)) {
        continue
      }
      const abs = tryParseUrl(value, baseUrl)
      if (abs === null || !isHttpUrl(abs)) {
        el.removeAttribute(attr)
        continue
      }
      const cleaned = cleanTrackingParams(abs.toString(), hosts)
      el.setAttribute(attr, cleaned)
    }
    const srcset = el.getAttribute('srcset')
    if (srcset !== null && srcset.length > 0) {
      el.setAttribute(
        'srcset',
        rewriteSrcset(srcset, baseUrl, (url) => url),
      )
    }
  }
}

function proxyMedia(
  document: Document,
  baseUrl: string,
  imageProxy: (url: string) => string,
): void {
  for (const el of [...document.querySelectorAll('img, video, audio, source')]) {
    const src = el.getAttribute('src')
    if (src !== null && src.length > 0 && !isAllowedDataUrl(src) && !src.startsWith('/img?')) {
      const abs = tryParseUrl(src, baseUrl)
      if (abs !== null && isHttpUrl(abs)) {
        el.setAttribute('src', imageProxy(abs.toString()))
      }
    }
    const poster = el.getAttribute('poster')
    if (poster !== null && poster.length > 0 && !poster.startsWith('/img?')) {
      const abs = tryParseUrl(poster, baseUrl)
      if (abs !== null && isHttpUrl(abs)) {
        el.setAttribute('poster', imageProxy(abs.toString()))
      }
    }
    const srcset = el.getAttribute('srcset')
    if (srcset !== null && srcset.length > 0) {
      el.setAttribute('srcset', rewriteSrcset(srcset, baseUrl, imageProxy))
    }
  }
}

const LEAD_IMAGE_SOURCES = [
  { selector: 'meta[property="twitter:image"]', attribute: 'content', proxied: false },
  { selector: 'meta[property="og:image"]', attribute: 'content', proxied: false },
  { selector: 'img[src]', attribute: 'src', proxied: true },
  { selector: 'video[poster]', attribute: 'poster', proxied: true },
] as const

function extractLeadImage(document: Document, imageProxy: (url: string) => string): string | null {
  for (const source of LEAD_IMAGE_SOURCES) {
    const value = document.querySelector(source.selector)?.getAttribute(source.attribute)
    if (value !== null && value !== undefined && value.length > 0) {
      return source.proxied ? value : imageProxy(value)
    }
  }
  return null
}

export function sanitizeContent(html: string, ctx: SanitizeContext): SanitizeResult {
  try {
    const window = parseHTML(wrapFragment(html), { NodeFilter })
    if (!hasDocument(window)) {
      return fallbackResult(html)
    }
    const document = window.document
    restoreLazyImages(document)
    absolutizeUrls(document, ctx.baseUrl, { feedHost: ctx.feedHost, siteHost: ctx.siteHost })
    removeTracking(document)
    replaceEmbeds(document, ctx.baseUrl)
    // linkedomのdocumentにはimplementationが無く、DOMPurifyはisSupportedをfalseにして
    // 入力を素通しする。タグと属性の許可リストはapplyAllowlistが担う
    applyAllowlist(document)
    proxyMedia(document, ctx.baseUrl, ctx.imageProxy)
    normalizeHeadings(document)
    decorateMediaAndLinks(document)
    const outHtml = document.body?.innerHTML ?? ''
    const text = htmlToPlainText(outHtml)
    return {
      html: outHtml,
      summary: truncateChars(text, 256),
      leadImageUrl: extractLeadImage(document, ctx.imageProxy),
      textLength: text.length,
    }
  } catch {
    return fallbackResult(html)
  }
}

export function ogImageFromHtml(html: string, baseUrl: string): string | null {
  const window = parseHTML(wrapFragment(html))
  const og = window.document.querySelector('meta[property="og:image"]')?.getAttribute('content')
  if (og === null || og === undefined || og.length === 0) {
    return null
  }
  const abs = tryParseUrl(og, baseUrl)
  if (abs === null || !isHttpUrl(abs)) {
    return null
  }
  return abs.toString()
}

export { IFRAME_HOSTS }
