import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Bootstrap, ItemDetail, ItemListPage, ItemSummary } from './queries.ts'
import { queryKeys } from './queries.ts'
import { itemRefOf } from './refs.ts'

export async function cancelItemQueriesForIds(
  queryClient: QueryClient,
  ids: number[],
): Promise<void> {
  const idSet = new Set(ids)
  const refs = new Set<string>()
  for (const [, data] of queryClient.getQueriesData<InfiniteData<ItemListPage>>({
    queryKey: ['items'],
  })) {
    for (const page of data?.pages ?? []) {
      for (const item of page.items) {
        if (idSet.has(item.id)) {
          refs.add(itemRefOf(item))
        }
      }
    }
  }
  await queryClient.cancelQueries({
    queryKey: ['item'],
    predicate: (query) => {
      const item = query.state.data as ItemDetail | undefined
      const ref = query.queryKey[1]
      return (
        (item !== undefined && idSet.has(item.id)) || (typeof ref === 'string' && refs.has(ref))
      )
    },
  })
}

function patchItems(
  queryClient: QueryClient,
  ids: number[],
  patch: Partial<Pick<ItemSummary, 'is_read' | 'is_bookmarked'>>,
): void {
  const idSet = new Set(ids)
  queryClient.setQueriesData<ItemDetail>({ queryKey: ['item'] }, (item) =>
    item === undefined || !idSet.has(item.id) ? item : { ...item, ...patch },
  )
  queryClient.setQueriesData<InfiniteData<ItemListPage>>({ queryKey: ['items'] }, (data) =>
    data === undefined
      ? data
      : {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (idSet.has(item.id) ? { ...item, ...patch } : item)),
          })),
        },
  )
}

export function patchItemsRead(queryClient: QueryClient, ids: number[], isRead: boolean): void {
  patchItems(queryClient, ids, { is_read: isRead })
}

export function patchItemsBookmarked(
  queryClient: QueryClient,
  ids: number[],
  isBookmarked: boolean,
): void {
  patchItems(queryClient, ids, { is_bookmarked: isBookmarked })
}

export function collectUnreadDeltas(
  queryClient: QueryClient,
  ids: number[],
  isRead: boolean,
): Map<number, number> | null {
  const known = new Map<number, { feed_id: number; is_read: boolean }>()
  for (const [, data] of queryClient.getQueriesData<InfiniteData<ItemListPage>>({
    queryKey: ['items'],
  })) {
    for (const page of data?.pages ?? []) {
      for (const item of page.items) {
        if (!known.has(item.id)) {
          known.set(item.id, { feed_id: item.feed_id, is_read: item.is_read })
        }
      }
    }
  }
  for (const [, item] of queryClient.getQueriesData<ItemDetail>({ queryKey: ['item'] })) {
    if (item !== undefined && !known.has(item.id)) {
      known.set(item.id, { feed_id: item.feed_id, is_read: item.is_read })
    }
  }

  const deltas = new Map<number, number>()
  for (const id of ids) {
    const item = known.get(id)
    if (item === undefined) {
      return null
    }
    if (item.is_read === isRead) {
      continue
    }
    deltas.set(item.feed_id, (deltas.get(item.feed_id) ?? 0) + (isRead ? -1 : 1))
  }
  return deltas
}

export function patchBootstrapUnread(queryClient: QueryClient, deltas: Map<number, number>): void {
  if (deltas.size === 0) {
    return
  }
  queryClient.setQueryData<Bootstrap>(queryKeys.bootstrap, (bootstrap) => {
    if (bootstrap === undefined) {
      return bootstrap
    }
    const feeds = bootstrap.feeds.map((feed) => {
      const delta = deltas.get(feed.id)
      if (delta === undefined || delta === 0) {
        return feed
      }
      return { ...feed, unread_count: Math.max(0, feed.unread_count + delta) }
    })
    const unreadCount = feeds.reduce((total, feed) => total + feed.unread_count, 0)
    return { ...bootstrap, feeds, unread_count: unreadCount }
  })
}

function sameHeldRow(previous: ItemSummary, next: ItemSummary): boolean {
  return previous.is_read === next.is_read && previous.is_bookmarked === next.is_bookmarked
}

export function holdStreamItems(previous: ItemSummary[], fetched: ItemSummary[]): ItemSummary[] {
  if (previous.length === 0) {
    return fetched.length === 0 ? previous : fetched
  }
  const fetchedById = new Map(fetched.map((item) => [item.id, item]))
  const result: ItemSummary[] = []
  const seen = new Set<number>()
  let changed = false
  for (const item of previous) {
    const latest = fetchedById.get(item.id)
    if (latest === undefined) {
      result.push(item)
      seen.add(item.id)
      continue
    }
    seen.add(item.id)
    if (sameHeldRow(item, latest)) {
      result.push(item)
      continue
    }
    result.push(latest)
    changed = true
  }
  for (const item of fetched) {
    if (seen.has(item.id)) {
      continue
    }
    result.push(item)
    changed = true
  }
  return changed || result.length !== previous.length ? result : previous
}

export function useHeldStreamItems(streamKey: string, fetchedItems: ItemSummary[]): ItemSummary[] {
  const [held, setHeld] = useState<{ key: string; items: ItemSummary[] }>({
    key: streamKey,
    items: fetchedItems,
  })
  if (held.key !== streamKey) {
    setHeld({ key: streamKey, items: fetchedItems })
    return fetchedItems
  }
  const merged = holdStreamItems(held.items, fetchedItems)
  if (merged !== held.items) {
    setHeld({ key: streamKey, items: merged })
  }
  return merged
}
