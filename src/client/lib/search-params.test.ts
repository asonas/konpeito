import { describe, expect, it } from 'vitest'
import {
  compactSearch,
  parseReaderSearch,
  streamFromFilter,
  streamFromView,
} from './search-params.ts'

describe('parseReaderSearch', () => {
  it('omits the default all filter and keeps unread in the URL', () => {
    expect(parseReaderSearch({})).toEqual({})
    expect(parseReaderSearch({ filter: 'all' })).toEqual({})
    expect(parseReaderSearch({ filter: 'unread' })).toEqual({ filter: 'unread' })
    expect(parseReaderSearch({ filter: 'starred' })).toEqual({ filter: 'starred' })
    expect(parseReaderSearch({ filter: 'bookmarked' })).toEqual({ filter: 'bookmarked' })
  })
})

describe('streamFromFilter', () => {
  it('treats a missing filter as all items', () => {
    expect(streamFromFilter(undefined)).toBe('all')
    expect(streamFromFilter('all')).toBe('all')
    expect(streamFromFilter('unread')).toBe('unread')
    expect(streamFromFilter('starred')).toBe('bookmarked')
    expect(streamFromFilter('bookmarked')).toBe('bookmarked')
  })
})

describe('streamFromView', () => {
  it('uses the path source before the leftover query filter', () => {
    expect(streamFromView({ kind: 'unread' }, 'bookmarked')).toBe('unread')
    expect(streamFromView({ kind: 'bookmarks' }, 'unread')).toBe('bookmarked')
    expect(streamFromView({ kind: 'all' }, 'recently-read')).toBe('recently_read')
  })
})

describe('compactSearch', () => {
  it('drops filter=all and keeps other filters', () => {
    expect(compactSearch({ filter: 'all' }, 'desc')).toEqual({})
    expect(compactSearch({ filter: 'unread' }, 'desc')).toEqual({ filter: 'unread' })
    expect(compactSearch({ filter: 'starred', order: 'desc' }, 'desc')).toEqual({
      filter: 'starred',
    })
  })
})
