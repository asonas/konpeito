import type { ReaderSearch } from '../../shared/constants.ts'
import { isPathFilter, type Source } from './search-params.ts'

export type ReaderHref =
  | { to: '/'; search: ReaderSearch }
  | { to: '/items'; search: ReaderSearch }
  | { to: '/unread'; search: ReaderSearch }
  | { to: '/bookmarks'; search: ReaderSearch }
  | { to: '/feeds/$feedId'; params: { feedId: string }; search: ReaderSearch }
  | { to: '/tags/$tagId'; params: { tagId: string }; search: ReaderSearch }
  | { to: '/search'; search: ReaderSearch }
  | { to: '/items/$itemId'; params: { itemId: string }; search: ReaderSearch }
  | { to: '/unread/items/$itemId'; params: { itemId: string }; search: ReaderSearch }
  | { to: '/bookmarks/items/$itemId'; params: { itemId: string }; search: ReaderSearch }
  | {
      to: '/feeds/$feedId/items/$itemId'
      params: { feedId: string; itemId: string }
      search: ReaderSearch
    }
  | {
      to: '/tags/$tagId/items/$itemId'
      params: { tagId: string; itemId: string }
      search: ReaderSearch
    }
  | { to: '/search/items/$itemId'; params: { itemId: string }; search: ReaderSearch }

function withSourceQ(source: Source, search: ReaderSearch): ReaderSearch {
  const next: ReaderSearch = {}
  if (source.kind === 'search') {
    next.q = source.q
  }
  if (search.filter !== undefined && !isPathFilter(search.filter)) {
    next.filter = search.filter
  }
  if (search.order !== undefined) {
    next.order = search.order
  }
  return next
}

/**
 * homeUnreadはトップページを未読の記事にする設定
 * オンのとき、すべての記事のリンク先は/ではなく/itemsになる
 * どちらの設定でも/と/itemsの両方で開けるが、リンクは設定に沿ったURLを指す
 */
export function sourceLink(source: Source, search: ReaderSearch, homeUnread = false): ReaderHref {
  const next = withSourceQ(source, search)
  if (source.kind === 'feed') {
    return { to: '/feeds/$feedId', params: { feedId: source.publicId }, search: next }
  }
  if (source.kind === 'tag') {
    return { to: '/tags/$tagId', params: { tagId: source.publicId }, search: next }
  }
  if (source.kind === 'search') {
    return { to: '/search', search: next }
  }
  if (source.kind === 'unread') {
    return { to: '/unread', search: next }
  }
  if (source.kind === 'bookmarks') {
    return { to: '/bookmarks', search: next }
  }
  if (homeUnread) {
    return { to: '/items', search: next }
  }
  return { to: '/', search: next }
}

export function itemLink(source: Source, itemRef: string, search: ReaderSearch): ReaderHref {
  const next = withSourceQ(source, search)
  const id = itemRef
  if (source.kind === 'feed') {
    return {
      to: '/feeds/$feedId/items/$itemId',
      params: { feedId: source.publicId, itemId: id },
      search: next,
    }
  }
  if (source.kind === 'tag') {
    return {
      to: '/tags/$tagId/items/$itemId',
      params: { tagId: source.publicId, itemId: id },
      search: next,
    }
  }
  if (source.kind === 'search') {
    return { to: '/search/items/$itemId', params: { itemId: id }, search: next }
  }
  if (source.kind === 'unread') {
    return { to: '/unread/items/$itemId', params: { itemId: id }, search: next }
  }
  if (source.kind === 'bookmarks') {
    return { to: '/bookmarks/items/$itemId', params: { itemId: id }, search: next }
  }
  return { to: '/items/$itemId', params: { itemId: id }, search: next }
}
