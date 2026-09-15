import { describe, expect, it } from 'vitest'
import { itemLink, sourceLink } from './links.ts'

describe('itemLink', () => {
  it('drops the filter that the path already says, and keeps the sort order', () => {
    expect(itemLink({ kind: 'unread' }, 'itemaaaaaa', { filter: 'unread', order: 'asc' })).toEqual({
      to: '/unread/items/$itemId',
      params: { itemId: 'itemaaaaaa' },
      search: { order: 'asc' },
    })
    expect(itemLink({ kind: 'bookmarks' }, 'itemaaaaaa', { filter: 'bookmarked' })).toEqual({
      to: '/bookmarks/items/$itemId',
      params: { itemId: 'itemaaaaaa' },
      search: {},
    })
  })

  it('keeps a filter the path cannot express', () => {
    expect(itemLink({ kind: 'all' }, 'itemaaaaaa', { filter: 'recently-read' })).toEqual({
      to: '/items/$itemId',
      params: { itemId: 'itemaaaaaa' },
      search: { filter: 'recently-read' },
    })
  })

  it('carries the query of a search source and drops it elsewhere', () => {
    expect(itemLink({ kind: 'search', q: 'hello' }, 'itemaaaaaa', {})).toEqual({
      to: '/search/items/$itemId',
      params: { itemId: 'itemaaaaaa' },
      search: { q: 'hello' },
    })
    expect(
      itemLink({ kind: 'feed', feedId: 1, publicId: 'feedaaaa' }, 'itemaaaaaa', { q: 'hello' }),
    ).toEqual({
      to: '/feeds/$feedId/items/$itemId',
      params: { feedId: 'feedaaaa', itemId: 'itemaaaaaa' },
      search: {},
    })
  })
})

describe('sourceLink', () => {
  it('points all articles at / by default', () => {
    expect(sourceLink({ kind: 'all' }, { order: 'asc' })).toEqual({
      to: '/',
      search: { order: 'asc' },
    })
  })

  it('points all articles at /items when the home page shows unread', () => {
    expect(sourceLink({ kind: 'all' }, { order: 'asc' }, true)).toEqual({
      to: '/items',
      search: { order: 'asc' },
    })
  })

  it('keeps unread at /unread whichever page is the home page', () => {
    expect(sourceLink({ kind: 'unread' }, {}, true)).toEqual({ to: '/unread', search: {} })
    expect(sourceLink({ kind: 'unread' }, {}, false)).toEqual({ to: '/unread', search: {} })
  })
})
