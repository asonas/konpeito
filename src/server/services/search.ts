export interface ParsedSearch {
  text: string
  unread: boolean | null
  bookmarked: boolean | null
  feedId: number | null
  tagName: string | null
  after: number | null
  before: number | null
}

export function ftsMatchQuery(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
  }
  return trimmed.replaceAll('"', '')
}

function parseDay(value: string, endOfDay: boolean): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) {
    return null
  }
  const y = match[1]
  const mo = match[2]
  const d = match[3]
  if (y === undefined || mo === undefined || d === undefined) {
    return null
  }
  const iso = endOfDay ? `${y}-${mo}-${d}T23:59:59Z` : `${y}-${mo}-${d}T00:00:00Z`
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) {
    return null
  }
  return Math.floor(ms / 1000)
}

function tokenize(q: string): string[] {
  const tokens: string[] = []
  const re = /"([^"]+)"|(\S+)/g
  let match = re.exec(q)
  while (match !== null) {
    const quoted = match[1]
    const bare = match[2]
    if (quoted !== undefined) {
      tokens.push(`"${quoted}"`)
    } else if (bare !== undefined) {
      tokens.push(bare)
    }
    match = re.exec(q)
  }
  return tokens
}

export function parseSearchQuery(q: string): ParsedSearch {
  let isUnread: boolean | null = null
  let isStarred: boolean | null = null
  let feedId: number | null = null
  let tagName: string | null = null
  let afterSec: number | null = null
  let beforeSec: number | null = null
  let phrase: string | null = null
  const terms: string[] = []

  for (const token of tokenize(q.trim())) {
    if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
      phrase = token.slice(1, -1)
      continue
    }
    const colon = token.indexOf(':')
    if (colon > 0) {
      const key = token.slice(0, colon).toLowerCase()
      const value = token.slice(colon + 1)
      if (key === 'is') {
        if (value === 'unread') {
          isUnread = true
        } else if (value === 'read') {
          isUnread = false
        } else if (value === 'starred' || value === 'bookmarked') {
          isStarred = true
        }
        continue
      }
      if (key === 'feed') {
        const n = Number(value)
        if (Number.isInteger(n) && n > 0) {
          feedId = n
        }
        continue
      }
      if (key === 'tag' && value.length > 0) {
        tagName = value
        continue
      }
      if (key === 'after') {
        afterSec = parseDay(value, false)
        continue
      }
      if (key === 'before') {
        beforeSec = parseDay(value, true)
        continue
      }
    }
    terms.push(token)
  }

  const termText = terms.join(' ').trim()

  return {
    text: phrase ?? termText,
    unread: isUnread,
    bookmarked: isStarred,
    feedId,
    tagName,
    after: afterSec,
    before: beforeSec,
  }
}
