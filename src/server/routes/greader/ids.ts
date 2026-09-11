export type ParsedStream =
  | { kind: 'feed'; feedId: number }
  | { kind: 'label'; name: string }
  | { kind: 'reading-list' }
  | { kind: 'read' }
  | { kind: 'kept-unread' }
  | { kind: 'starred' }

export function parseStreamId(raw: string): ParsedStream | null {
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }
  const feed = /^feed\/(\d+)$/.exec(decoded)
  if (feed) {
    const id = feed[1]
    if (id === undefined) {
      return null
    }
    return { kind: 'feed', feedId: Number(id) }
  }
  const label = /^user\/-\/label\/(.+)$/.exec(decoded)
  if (label) {
    const name = label[1]
    if (name === undefined) {
      return null
    }
    return { kind: 'label', name }
  }
  if (decoded === 'user/-/state/com.google/reading-list') {
    return { kind: 'reading-list' }
  }
  if (decoded === 'user/-/state/com.google/read') {
    return { kind: 'read' }
  }
  if (decoded === 'user/-/state/com.google/kept-unread') {
    return { kind: 'kept-unread' }
  }
  if (decoded === 'user/-/state/com.google/starred') {
    return { kind: 'starred' }
  }
  return null
}

export function parseItemId(raw: string): number | null {
  const long = /^tag:google.com,2005:reader\/item\/([0-9a-fA-F]+)$/.exec(raw)
  if (long) {
    const hex = long[1]
    if (hex === undefined) {
      return null
    }
    const n = Number.parseInt(hex, 16)
    return Number.isInteger(n) && n > 0 ? n : null
  }
  if (/^[0-9a-fA-F]{16}$/.test(raw)) {
    const n = Number.parseInt(raw, 16)
    return Number.isInteger(n) && n > 0 ? n : null
  }
  if (/^[0-9]+$/.test(raw)) {
    const n = Number.parseInt(raw, 10)
    return Number.isInteger(n) && n > 0 ? n : null
  }
  return null
}

export function formatItemId(id: number): string {
  return `tag:google.com,2005:reader/item/${id.toString(16).toUpperCase().padStart(16, '0')}`
}

export function usecString(unixSec: number): string {
  return `${unixSec}000000`
}

export function msecString(unixSec: number): string {
  return `${unixSec}000`
}

export async function readFormParams(request: Request): Promise<URLSearchParams> {
  const url = new URL(request.url)
  const merged = new URLSearchParams(url.searchParams)
  if (request.method === 'GET' || request.method === 'HEAD') {
    return merged
  }
  const contentType = request.headers.get('content-type') ?? ''
  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('text/plain')
  ) {
    const text = new TextDecoder().decode(await request.arrayBuffer())
    const form = new URLSearchParams(text)
    for (const [key, value] of form) {
      merged.append(key, value)
    }
    return merged
  }
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') {
        merged.append(key, value)
      }
    }
  }
  return merged
}
