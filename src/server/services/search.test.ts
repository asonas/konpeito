import { describe, expect, it } from 'vitest'
import { parseSearchQuery } from './search.ts'

describe('parseSearchQuery', () => {
  it('parses Feedbin-style operators', () => {
    const parsed = parseSearchQuery(
      'is:unread is:bookmarked feed:12 tag:ブログ after:2026-01-01 before:2026-06-01 "完全一致" extra',
    )
    expect(parsed.unread).toBe(true)
    expect(parsed.bookmarked).toBe(true)
    expect(parsed.feedId).toBe(12)
    expect(parsed.tagName).toBe('ブログ')
    expect(parsed.after).toBe(Date.parse('2026-01-01T00:00:00Z') / 1000)
    expect(parsed.before).toBe(Date.parse('2026-06-01T23:59:59Z') / 1000)
    expect(parsed.text).toBe('完全一致')
    expect(parseSearchQuery('is:read').unread).toBe(false)
    // starredはbookmarkedの別名
    expect(parseSearchQuery('is:starred').bookmarked).toBe(true)
  })
})
