import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  cancelItemQueriesForIds,
  collectUnreadDeltas,
  patchBootstrapUnread,
  patchItemsBookmarked,
  patchItemsRead,
} from './item-cache.ts'
import {
  type MarkAllReadBody,
  markStreamRead,
  queryKeys,
  setItemsBookmarked,
  setItemsRead,
} from './queries.ts'

type Snapshot = ReturnType<QueryClient['getQueriesData']>

async function snapshot(queryClient: QueryClient, ids: number[]): Promise<Snapshot> {
  await queryClient.cancelQueries({ queryKey: ['items'] })
  await cancelItemQueriesForIds(queryClient, ids)
  return [
    ...queryClient.getQueriesData({ queryKey: ['items'] }),
    ...queryClient.getQueriesData({ queryKey: ['item'] }),
    ...queryClient.getQueriesData({ queryKey: queryKeys.bootstrap }),
  ]
}

/**
 * `snapshot()`の`cancelQueries`は、まだ結果の届いていない取得も中断する
 * 中断されたクエリはデータがないまま止まってしまうので、更新が済んだあとに取り直す
 * 読み込み済みの記事しかないときは1件も該当せず、リクエストは増えない
 */
async function refetchStrandedItems(queryClient: QueryClient): Promise<void> {
  await queryClient.refetchQueries({
    queryKey: ['item'],
    type: 'active',
    predicate: (query) => query.state.data === undefined,
  })
}

function restore(queryClient: QueryClient, saved: Snapshot | undefined): void {
  if (!saved) {
    return
  }
  for (const [key, data] of saved) {
    queryClient.setQueryData(key, data)
  }
}

interface ItemMutations {
  setRead: (ids: number[], read: boolean) => void
  setBookmarked: (ids: number[], bookmarked: boolean) => void
  markAllRead: (body: MarkAllReadBody, visibleIds: number[]) => Promise<void>
}

export function useItemMutations(): ItemMutations {
  const queryClient = useQueryClient()

  const read = useMutation({
    mutationFn: ({ ids, read }: { ids: number[]; read: boolean }) => setItemsRead(ids, read),
    onMutate: async ({ ids, read }) => {
      const saved = await snapshot(queryClient, ids)
      const deltas = collectUnreadDeltas(queryClient, ids, read)
      patchItemsRead(queryClient, ids, read)
      if (deltas !== null) {
        patchBootstrapUnread(queryClient, deltas)
      }
      return { saved, deltas }
    },
    onError: (_error, _vars, context) => restore(queryClient, context?.saved),
    onSuccess: async (_data, _vars, context) => {
      if (context.deltas === null) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
      }
      await refetchStrandedItems(queryClient)
    },
  })

  const bookmark = useMutation({
    mutationFn: ({ ids, bookmarked }: { ids: number[]; bookmarked: boolean }) =>
      setItemsBookmarked(ids, bookmarked),
    onMutate: async ({ ids, bookmarked }) => {
      const saved = await snapshot(queryClient, ids)
      patchItemsBookmarked(queryClient, ids, bookmarked)
      return saved
    },
    onError: (_error, _vars, saved) => restore(queryClient, saved),
    onSuccess: () => refetchStrandedItems(queryClient),
  })

  const markAll = useMutation({
    mutationFn: ({ body }: { body: MarkAllReadBody; visibleIds: number[] }) => markStreamRead(body),
    onMutate: async ({ visibleIds }) => {
      const saved = await snapshot(queryClient, visibleIds)
      patchItemsRead(queryClient, visibleIds, true)
      return saved
    },
    onError: (_error, _vars, saved) => restore(queryClient, saved),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
      await refetchStrandedItems(queryClient)
    },
  })

  return {
    setRead: (ids, isRead) => read.mutate({ ids, read: isRead }),
    setBookmarked: (ids, bookmarked) => bookmark.mutate({ ids, bookmarked }),
    markAllRead: (body, visibleIds) => markAll.mutateAsync({ body, visibleIds }).then(() => {}),
  }
}
