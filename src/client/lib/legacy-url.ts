import type { ReaderSearch } from '../../shared/constants.ts'
import { itemLink, type ReaderHref, sourceLink } from './links.ts'
import type { Feed, Tag } from './queries.ts'
import { isNumericRef, resolveRef } from './refs.ts'
import { type Source, withoutPathFilter } from './search-params.ts'
import { feedSource, sourceFromRoute, tagSource } from './sources.ts'

interface LegacyUrlInput {
  feedRef: string | undefined
  tagRef: string | undefined
  itemRef: string | undefined
  onSearch: boolean
  onUnread?: boolean
  onBookmarks?: boolean
  search: ReaderSearch
  feeds: Feed[]
  tags: Tag[]
  itemPublicId: string | undefined
  homeUnread?: boolean
}

type LegacyUrlResult =
  | { kind: 'none' }
  | { kind: 'waiting' }
  | { kind: 'redirect'; href: ReaderHref }

function hrefFor(
  source: Source,
  itemRef: string | undefined,
  search: ReaderSearch,
  homeUnread: boolean,
): ReaderHref {
  const next = withoutPathFilter(search)
  if (itemRef === undefined) {
    return sourceLink(source, next, homeUnread)
  }
  return itemLink(source, itemRef, next)
}

export function legacyUrlRedirect(input: LegacyUrlInput): LegacyUrlResult {
  const feedNumeric = input.feedRef !== undefined && isNumericRef(input.feedRef)
  const tagNumeric = input.tagRef !== undefined && isNumericRef(input.tagRef)
  const itemNumeric = input.itemRef !== undefined && isNumericRef(input.itemRef)
  if (!feedNumeric && !tagNumeric && !itemNumeric) {
    return { kind: 'none' }
  }

  let source: Source
  if (input.onSearch) {
    source = { kind: 'search', q: input.search.q ?? '' }
  } else if (input.feedRef !== undefined) {
    const feed = resolveRef(input.feeds, input.feedRef)
    if (!feed?.public_id) {
      return { kind: 'none' }
    }
    source = feedSource(feed)
  } else if (input.tagRef !== undefined) {
    const tag = resolveRef(input.tags, input.tagRef)
    if (!tag?.public_id) {
      return { kind: 'none' }
    }
    source = tagSource(tag)
  } else {
    source = sourceFromFilterQuery(input)
  }

  const homeUnread = input.homeUnread === true
  if (input.itemRef === undefined) {
    return { kind: 'redirect', href: hrefFor(source, undefined, input.search, homeUnread) }
  }
  if (!itemNumeric) {
    return { kind: 'redirect', href: hrefFor(source, input.itemRef, input.search, homeUnread) }
  }
  if (input.itemPublicId === undefined) {
    return { kind: 'waiting' }
  }
  return {
    kind: 'redirect',
    href: hrefFor(source, input.itemPublicId, input.search, homeUnread),
  }
}

function sourceFromFilterQuery(input: LegacyUrlInput): Source {
  const filter = input.search.filter
  if (input.onSearch || input.feedRef !== undefined || input.tagRef !== undefined) {
    return sourceFromRoute({
      onSearch: input.onSearch,
      onUnread: input.onUnread === true,
      onBookmarks: input.onBookmarks === true,
      q: input.search.q,
      feedRef: input.feedRef,
      tagRef: input.tagRef,
      feeds: input.feeds,
      tags: input.tags,
    })
  }
  if (filter === 'unread' || (input.onUnread && filter !== 'starred' && filter !== 'bookmarked')) {
    return { kind: 'unread' }
  }
  if (filter === 'starred' || filter === 'bookmarked' || input.onBookmarks) {
    return { kind: 'bookmarks' }
  }
  return { kind: 'all' }
}

export function queryFilterRedirect(input: LegacyUrlInput): LegacyUrlResult {
  const filter = input.search.filter
  if (filter !== 'unread' && filter !== 'starred' && filter !== 'bookmarked' && filter !== 'all') {
    return { kind: 'none' }
  }
  const source = sourceFromFilterQuery(input)
  if (source.kind === 'missing') {
    return { kind: 'none' }
  }
  return {
    kind: 'redirect',
    href: hrefFor(source, input.itemRef, input.search, input.homeUnread === true),
  }
}
