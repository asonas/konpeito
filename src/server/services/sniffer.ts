import type { FeedFormat } from './parser/types.ts'

export type { FeedFormat }

const UTF8_BOM = [0xef, 0xbb, 0xbf]
const XML_LEGAL_RE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: XML 1.0 legal character ranges
  /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu

function skipBomAndWs(bytes: Uint8Array): Uint8Array {
  let i = 0
  if (
    bytes.length >= 3 &&
    bytes[0] === UTF8_BOM[0] &&
    bytes[1] === UTF8_BOM[1] &&
    bytes[2] === UTF8_BOM[2]
  ) {
    i = 3
  }
  while (i < bytes.length) {
    const b = bytes[i]
    if (b === undefined || (b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x20)) {
      break
    }
    i += 1
  }
  return bytes.subarray(i)
}

const LATIN1 = new TextDecoder('iso-8859-1', { fatal: false })

export function decodeUtf8Lenient(bytes: Uint8Array, limit?: number): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(
    limit === undefined ? bytes : bytes.subarray(0, limit),
  )
}

export function decodeWithLabel(body: Uint8Array, label: string): string | null {
  try {
    return new TextDecoder(label, { fatal: false }).decode(body)
  } catch {
    return null
  }
}

function firstRootName(xml: string): string | null {
  let i = 0
  const n = xml.length
  while (i < n) {
    const lt = xml.indexOf('<', i)
    if (lt === -1) {
      return null
    }
    const next = xml[lt + 1]
    if (next === undefined) {
      return null
    }
    if (next === '?' || next === '!') {
      if (xml.startsWith('<!--', lt)) {
        const end = xml.indexOf('-->', lt + 4)
        i = end === -1 ? n : end + 3
        continue
      }
      if (xml.startsWith('<![CDATA[', lt)) {
        const end = xml.indexOf(']]>', lt + 9)
        i = end === -1 ? n : end + 3
        continue
      }
      const end = xml.indexOf('>', lt + 1)
      i = end === -1 ? n : end + 1
      continue
    }
    if (next === '/') {
      const end = xml.indexOf('>', lt + 1)
      i = end === -1 ? n : end + 1
      continue
    }
    let j = lt + 1
    while (j < n) {
      const ch = xml[j]
      if (ch === undefined || /[\s>/]/.test(ch)) {
        break
      }
      j += 1
    }
    const name = xml.slice(lt + 1, j)
    const local = name.includes(':') ? (name.split(':').pop() ?? name) : name
    return local
  }
  return null
}

export function sniffFormat(head: Uint8Array): FeedFormat | null {
  const trimmed = skipBomAndWs(head)
  const first = trimmed[0]
  if (first === undefined) {
    return null
  }
  if (first === 0x7b) {
    return 'jsonfeed'
  }
  if (first !== 0x3c) {
    return null
  }
  const text = decodeUtf8Lenient(trimmed, 2048)
  const root = firstRootName(text)
  if (root === null) {
    return null
  }
  const lower = root.toLowerCase()
  if (lower === 'rss') {
    return 'rss'
  }
  if (lower === 'rdf' || lower === 'rdf:rdf') {
    return 'rdf'
  }
  if (root === 'RDF') {
    return 'rdf'
  }
  if (lower === 'feed') {
    return 'atom'
  }
  return null
}

export function charsetFromContentType(contentType: string | null): string | null {
  if (contentType === null) {
    return null
  }
  const match = /charset\s*=\s*("?)([^";\s]+)\1/i.exec(contentType)
  const value = match?.[2]
  return value === undefined ? null : value
}

function charsetFromProlog(bytes: Uint8Array): string | null {
  const head = decodeUtf8Lenient(bytes, 256)
  const match = /<\?xml[^>]*encoding\s*=\s*("|'|)([^"'?\s]+)\1/i.exec(head)
  const value = match?.[2]
  return value === undefined ? null : value
}

function stripIllegalXmlChars(text: string): string {
  return text.replace(XML_LEGAL_RE, '')
}

function stripDoctype(text: string): string {
  const lower = text.toLowerCase()
  const start = lower.indexOf('<!doctype')
  if (start === -1) {
    return text
  }
  let i = start + 9
  let depth = 0
  let inBracket = false
  while (i < text.length) {
    const ch = text[i]
    if (ch === undefined) {
      break
    }
    if (ch === '[') {
      inBracket = true
      depth += 1
    } else if (ch === ']') {
      depth = Math.max(0, depth - 1)
      if (depth === 0) {
        inBracket = false
      }
    } else if (ch === '>' && !inBracket) {
      return text.slice(0, start) + text.slice(i + 1)
    }
    i += 1
  }
  return text.slice(0, start)
}

export function decodeFeedBody(
  body: Uint8Array,
  contentType: string | null,
  format: FeedFormat,
): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    const label = charsetFromProlog(body) ?? charsetFromContentType(contentType) ?? 'iso-8859-1'
    text = decodeWithLabel(body, label) ?? LATIN1.decode(body)
  }
  if (format === 'jsonfeed') {
    return stripIllegalXmlChars(text)
  }
  return stripDoctype(stripIllegalXmlChars(text))
}
