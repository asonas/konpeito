import type { Filter } from '../../shared/constants.ts'
import { feedTitle } from '../../shared/feed.ts'
import type { Messages } from '../i18n/en.ts'
import { getMessages } from '../i18n/locale.ts'
import type { Feed, Tag } from './queries.ts'
import { publicIdOf, resolveRef } from './refs.ts'
import type { Source } from './search-params.ts'

export function feedSource(feed: Feed): Source {
  return { kind: 'feed', feedId: feed.id, publicId: publicIdOf(feed) ?? String(feed.id) }
}

export function tagSource(tag: Tag): Source {
  return { kind: 'tag', tagId: tag.id, publicId: publicIdOf(tag) ?? String(tag.id) }
}

export function sourceFromRoute(input: {
  onSearch: boolean
  onUnread?: boolean
  onBookmarks?: boolean
  q?: string | undefined
  feedRef?: string | undefined
  tagRef?: string | undefined
  feeds: Feed[]
  tags: Tag[]
}): Source {
  if (input.onSearch) {
    return { kind: 'search', q: input.q ?? '' }
  }
  if (input.feedRef !== undefined) {
    const feed = resolveRef(input.feeds, input.feedRef)
    return feed ? feedSource(feed) : { kind: 'missing' }
  }
  if (input.tagRef !== undefined) {
    const tag = resolveRef(input.tags, input.tagRef)
    return tag ? tagSource(tag) : { kind: 'missing' }
  }
  if (input.onUnread) {
    return { kind: 'unread' }
  }
  if (input.onBookmarks) {
    return { kind: 'bookmarks' }
  }
  return { kind: 'all' }
}

export function sourceIdentity(source: Source): string {
  switch (source.kind) {
    case 'feed':
      return `feed:${source.feedId}`
    case 'tag':
      return `tag:${source.tagId}`
    case 'search':
      return `search:${source.q}`
    default:
      return source.kind
  }
}

export function sameSource(a: Source, b: Source): boolean {
  if (a.kind !== b.kind) {
    return false
  }
  if (a.kind === 'feed' && b.kind === 'feed') {
    return a.feedId === b.feedId
  }
  if (a.kind === 'tag' && b.kind === 'tag') {
    return a.tagId === b.tagId
  }
  if (a.kind === 'search' && b.kind === 'search') {
    return a.q === b.q
  }
  return true
}

export function sourceHeading(
  source: Source,
  feeds: Feed[],
  tags: Tag[],
  filter?: Filter,
  messages: Messages = getMessages(),
): string {
  switch (source.kind) {
    case 'missing':
      return messages.common.notFound
    case 'unread':
      return messages.sidebar.unread
    case 'bookmarks':
      return messages.sidebar.bookmarked
    case 'all':
      switch (filter ?? 'all') {
        case 'recently-read':
          return messages.list.recentlyRead
        case 'updated':
          return messages.list.updatedHeading
        default:
          return messages.sidebar.allArticles
      }
    case 'feed': {
      const feed = feeds.find((entry) => entry.id === source.feedId)
      return feed ? feedTitle(feed) : messages.common.feed
    }
    case 'tag':
      return tags.find((tag) => tag.id === source.tagId)?.name ?? messages.common.tag
    case 'search':
      return messages.list.searchResults(source.q)
  }
}
