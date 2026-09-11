import {
  FILTERS,
  type Filter,
  type ReaderSearch,
  SORT_ORDERS,
  type SortOrder,
  type Stream,
} from '../../shared/constants.ts'

export type { Filter, ReaderSearch, SortOrder }

export type Source =
  | { kind: 'all' }
  | { kind: 'unread' }
  | { kind: 'bookmarks' }
  | { kind: 'feed'; feedId: number; publicId: string }
  | { kind: 'tag'; tagId: number; publicId: string }
  | { kind: 'search'; q: string }
  | { kind: 'missing' }

const PATH_FILTERS = new Set<Filter>(['unread', 'starred', 'bookmarked', 'all'])

export function isPathFilter(filter: Filter): boolean {
  return PATH_FILTERS.has(filter)
}

function isFilter(value: unknown): value is Filter {
  return FILTERS.includes(value as Filter)
}

function isSortOrder(value: unknown): value is SortOrder {
  return SORT_ORDERS.includes(value as SortOrder)
}

export function parseReaderSearch(raw: Record<string, unknown>): ReaderSearch {
  const search: ReaderSearch = {}
  if (isFilter(raw.filter) && raw.filter !== 'all') {
    search.filter = raw.filter
  }
  if (isSortOrder(raw.order)) {
    search.order = raw.order
  }
  if (typeof raw.q === 'string' && raw.q.length > 0) {
    search.q = raw.q
  }
  return search
}

export function streamFromFilter(filter: Filter | undefined): Stream {
  if (filter === undefined || filter === 'all') {
    return 'all'
  }
  if (filter === 'recently-read') {
    return 'recently_read'
  }
  if (filter === 'starred' || filter === 'bookmarked') {
    return 'bookmarked'
  }
  if (filter === 'unread') {
    return 'unread'
  }
  return 'updated'
}

export function streamFromView(source: Source, filter: Filter | undefined): Stream {
  if (source.kind === 'unread') {
    return 'unread'
  }
  if (source.kind === 'bookmarks') {
    return 'bookmarked'
  }
  return streamFromFilter(filter)
}

export function itemsParamsFrom(
  source: Source,
  filter: Filter | undefined,
  order: SortOrder,
): {
  stream: Stream
  feedId?: number
  tagId?: number
  q?: string
  order: SortOrder
} {
  const params: {
    stream: Stream
    feedId?: number
    tagId?: number
    q?: string
    order: SortOrder
  } = {
    stream: streamFromView(source, filter),
    order,
  }
  if (source.kind === 'feed') {
    params.feedId = source.feedId
  }
  if (source.kind === 'tag') {
    params.tagId = source.tagId
  }
  if (source.kind === 'search' && source.q.length > 0) {
    params.q = source.q
  }
  return params
}

export function withoutPathFilter(search: ReaderSearch): ReaderSearch {
  if (search.filter === undefined || !isPathFilter(search.filter)) {
    return search
  }
  const next: ReaderSearch = {}
  if (search.order !== undefined) {
    next.order = search.order
  }
  if (search.q !== undefined && search.q.length > 0) {
    next.q = search.q
  }
  return next
}

export function compactSearch(search: ReaderSearch, defaultOrder: SortOrder): ReaderSearch {
  const next: ReaderSearch = {}
  if (search.filter !== undefined && search.filter !== 'all') {
    next.filter = search.filter
  }
  if (search.order !== undefined && search.order !== defaultOrder) {
    next.order = search.order
  }
  if (search.q !== undefined && search.q.length > 0) {
    next.q = search.q
  }
  return next
}

export function readerSearchOf(
  filter: Filter | undefined,
  order: SortOrder | undefined,
  q: string | undefined,
  defaultOrder: SortOrder,
): ReaderSearch {
  return compactSearch(
    {
      ...(filter !== undefined ? { filter } : {}),
      ...(order !== undefined ? { order } : {}),
      ...(q !== undefined ? { q } : {}),
    },
    defaultOrder,
  )
}
