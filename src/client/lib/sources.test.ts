import { describe, expect, it } from 'vitest'
import type { Feed, Tag } from './queries.ts'
import { sourceFromRoute, sourceHeading, sourceIdentity } from './sources.ts'

function feed(id: number, publicId: string, title = 'フィード'): Feed {
  return { id, public_id: publicId, title, custom_title: null } as Feed
}

function tag(id: number, publicId: string, name = 'タグ'): Tag {
  return { id, public_id: publicId, name } as Tag
}

describe('sourceFromRoute', () => {
  const feeds = [feed(1, 'feedaaaa')]
  const tags = [tag(2, 'tagaaaa')]

  it('keeps all feeds when an item is open without a feed or tag path', () => {
    expect(
      sourceFromRoute({
        onSearch: false,
        feeds,
        tags,
      }),
    ).toEqual({ kind: 'all' })
  })

  it('uses the feed or tag from the path, and search from the search route', () => {
    expect(
      sourceFromRoute({
        onSearch: false,
        feedRef: 'feedaaaa',
        feeds,
        tags,
      }),
    ).toEqual({ kind: 'feed', feedId: 1, publicId: 'feedaaaa' })
    expect(
      sourceFromRoute({
        onSearch: false,
        tagRef: 'tagaaaa',
        feeds,
        tags,
      }),
    ).toEqual({ kind: 'tag', tagId: 2, publicId: 'tagaaaa' })
    expect(
      sourceFromRoute({
        onSearch: true,
        q: 'hello',
        feeds,
        tags,
      }),
    ).toEqual({ kind: 'search', q: 'hello' })
    expect(
      sourceFromRoute({
        onSearch: false,
        onUnread: true,
        feeds,
        tags,
      }),
    ).toEqual({ kind: 'unread' })
    expect(
      sourceFromRoute({
        onSearch: false,
        onBookmarks: true,
        feeds,
        tags,
      }),
    ).toEqual({ kind: 'bookmarks' })
  })

  it('marks an unknown feed or tag as missing', () => {
    expect(
      sourceFromRoute({
        onSearch: false,
        feedRef: 'missingg',
        feeds,
        tags,
      }),
    ).toEqual({ kind: 'missing' })
  })
})

describe('sourceIdentity', () => {
  it('distinguishes feeds, tags, and search queries', () => {
    expect(sourceIdentity({ kind: 'all' })).toBe('all')
    expect(sourceIdentity({ kind: 'unread' })).toBe('unread')
    expect(sourceIdentity({ kind: 'feed', feedId: 3, publicId: 'feedaaaa' })).toBe('feed:3')
    expect(sourceIdentity({ kind: 'tag', tagId: 4, publicId: 'tagaaaa' })).toBe('tag:4')
    expect(sourceIdentity({ kind: 'search', q: 'hello' })).toBe('search:hello')
  })
})

describe('sourceHeading', () => {
  const feeds = [feed(1, 'feedaaaa')]
  const tags = [tag(2, 'tagaaaa')]

  it('takes the heading from the matching row', () => {
    expect(sourceHeading({ kind: 'feed', feedId: 1, publicId: 'feedaaaa' }, feeds, tags)).toBe(
      'フィード',
    )
    expect(sourceHeading({ kind: 'tag', tagId: 2, publicId: 'tagaaaa' }, feeds, tags)).toBe('タグ')
  })

  it('falls back to the kind while the bootstrap has not arrived', () => {
    expect(sourceHeading({ kind: 'feed', feedId: 9, publicId: 'gone' }, [], [])).toBe('Feed')
    expect(sourceHeading({ kind: 'tag', tagId: 9, publicId: 'gone' }, [], [])).toBe('Tag')
  })
})
