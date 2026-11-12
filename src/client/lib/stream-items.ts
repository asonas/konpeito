import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { Filter, SortOrder } from '../../shared/constants.ts'
import { useHeldStreamItems } from './item-cache.ts'
import {
  fetchItem,
  fetchItemsPage,
  fetchRecommendationsPage,
  type ItemSummary,
  queryKeys,
} from './queries.ts'
import { itemRefOf } from './refs.ts'
import { itemsParamsFrom, type Source } from './search-params.ts'

export interface StreamItems {
  items: ItemSummary[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
}

export function useStreamItems(
  source: Source,
  filter: Filter | undefined,
  order: SortOrder,
): StreamItems {
  const queryClient = useQueryClient()
  const params = itemsParamsFrom(source, filter, order)
  const recommended = source.kind === 'recommended'
  // おすすめも`['items', ...]`に置き、既読やブックマークの楽観的な更新を他の一覧と同じく受ける
  const queryKey = recommended ? queryKeys.recommendations : queryKeys.items(params)
  const streamKey = JSON.stringify(queryKey)

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => {
      if (recommended) {
        return fetchRecommendationsPage()
      }
      return fetchItemsPage(pageParam === undefined ? params : { ...params, cursor: pageParam })
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor,
    enabled: source.kind !== 'missing',
  })

  const fetched = query.data?.pages.flatMap((page) => page.items) ?? []
  // 嗜好の版が変わると順位もスコアも作り直しになるので、前の版の一覧を引き継がない
  const heldKey = recommended ? `${streamKey}:${query.data?.pages[0]?.version ?? ''}` : streamKey
  const items = useHeldStreamItems(heldKey, fetched)

  const previousKey = useRef(streamKey)
  useEffect(() => {
    if (previousKey.current === streamKey) {
      return
    }
    const previous = previousKey.current
    previousKey.current = streamKey
    queryClient.removeQueries({
      predicate: (candidate) => JSON.stringify(candidate.queryKey) === previous,
    })
  }, [queryClient, streamKey])

  return {
    items,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: Boolean(query.hasNextPage),
    fetchNextPage: () => {
      void query.fetchNextPage()
    },
  }
}

export function usePrefetchItem(item: ItemSummary | undefined): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!item) {
      return
    }
    const ref = itemRefOf(item)
    void queryClient.prefetchQuery({ queryKey: queryKeys.item(ref), queryFn: () => fetchItem(ref) })
  }, [item, queryClient])
}
