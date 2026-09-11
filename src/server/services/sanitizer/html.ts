import { htmlToPlainTextParagraphs } from '../normalizer.ts'

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function truncateChars(text: string, max: number): string {
  const chars = [...text]
  if (chars.length <= max) {
    return text
  }
  return chars.slice(0, max).join('')
}

export function wrapFragment(html: string): string {
  return `<!DOCTYPE html><html><body>${html}</body></html>`
}

export function plaintextHtml(html: string): string {
  const paragraphs = htmlToPlainTextParagraphs(html)
  if (paragraphs.length === 0) {
    return ''
  }
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')
}

export function tryParseUrl(value: string, base: string): URL | null {
  try {
    return new URL(value, base)
  } catch {
    return null
  }
}

export function isHttpUrl(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:'
}

export function isAllowedDataUrl(value: string): boolean {
  const lower = value.toLowerCase()
  return (
    lower.startsWith('data:image/png') ||
    lower.startsWith('data:image/jpeg') ||
    lower.startsWith('data:image/gif') ||
    lower.startsWith('data:image/webp') ||
    lower.startsWith('data:image/avif') ||
    lower.startsWith('data:image/apng') ||
    lower.startsWith('data:image/svg+xml')
  )
}

export function isMailto(value: string): boolean {
  return value.toLowerCase().startsWith('mailto:')
}

export function hostMatches(hostname: string, allowed: string): boolean {
  const host = hostname.toLowerCase()
  const target = allowed.toLowerCase()
  return host === target || host.endsWith(`.${target}`)
}
