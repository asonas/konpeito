import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  cancelItemQueriesForIds,
  collectUnreadDeltas,
  holdStreamItems,
  patchBootstrapUnread,
  patchItemsRead,
} from './item-cache.ts'
import type { Bootstrap, ItemDetail, ItemListPage, ItemSummary } from './queries.ts'
import { queryKeys } from './queries.ts'

function summary(id: number, isRead: boolean, feedId = 1): ItemSummary {
  return {
    id,
    feed_id: feedId,
    title: `記事 ${id}`,
    url: null,
    author: null,
    summary: null,
    lead_image_url: null,
    published_at: 0,
    is_read: isRead,
    is_bookmarked: false,
    has_update: false,
    public_id: `item${id}`,
  }
}

describe('patchItemsRead', () => {
  it('updates matching item detail and list rows', () => {
    const client = new QueryClient()
    client.setQueryData(['item', 'item1'], {
      id: 1,
      is_read: false,
    } as ItemDetail)
    client.setQueryData(['items', { stream: 'unread' }], {
      pages: [{ items: [summary(1, false), summary(2, false)] } satisfies ItemListPage],
      pageParams: [undefined],
    })

    patchItemsRead(client, [1], true)

    expect(client.getQueryData<ItemDetail>(['item', 'item1'])?.is_read).toBe(true)
    const list = client.getQueryData<{ pages: ItemListPage[] }>(['items', { stream: 'unread' }])
    expect(list?.pages[0]?.items.map((item) => item.is_read)).toEqual([true, false])
  })
})

function bootstrapWith(feeds: { id: number; unread_count: number }[]): Bootstrap {
  return {
    feeds,
    tags: [],
    unread_count: feeds.reduce((total, feed) => total + feed.unread_count, 0),
    settings: {},
  } as unknown as Bootstrap
}

function clientWithList(items: ItemSummary[]): QueryClient {
  const client = new QueryClient()
  client.setQueryData(['items', { stream: 'unread' }], {
    pages: [{ items } satisfies ItemListPage],
    pageParams: [undefined],
  })
  return client
}

describe('cancelItemQueriesForIds', () => {
  it('keeps the next item prefetch running while the current item is updated', async () => {
    const client = clientWithList([summary(1, false), summary(2, false)])
    const pending = ({ signal }: { signal: AbortSignal }) =>
      new Promise<ItemDetail>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason))
      })
    void client.fetchQuery({ queryKey: queryKeys.item('item1'), queryFn: pending }).catch(() => {})
    void client.fetchQuery({ queryKey: queryKeys.item('item2'), queryFn: pending }).catch(() => {})

    await cancelItemQueriesForIds(client, [1])

    expect(client.getQueryState(queryKeys.item('item1'))?.fetchStatus).toBe('idle')
    expect(client.getQueryState(queryKeys.item('item2'))?.fetchStatus).toBe('fetching')
    await client.cancelQueries()
  })
})

describe('collectUnreadDeltas', () => {
  it('counts unread going down when items become read', () => {
    const client = clientWithList([summary(1, false), summary(2, false)])
    expect(collectUnreadDeltas(client, [1, 2], true)).toEqual(new Map([[1, -2]]))
  })

  it('counts unread going up when items become unread', () => {
    const client = clientWithList([summary(1, true)])
    expect(collectUnreadDeltas(client, [1], false)).toEqual(new Map([[1, 1]]))
  })

  it('ignores items already in the requested state', () => {
    const client = clientWithList([summary(1, true), summary(2, false)])
    expect(collectUnreadDeltas(client, [1, 2], true)).toEqual(new Map([[1, -1]]))
  })

  it('splits the deltas per feed', () => {
    const client = clientWithList([summary(1, false, 1), summary(2, false, 2)])
    expect(collectUnreadDeltas(client, [1, 2], true)).toEqual(
      new Map([
        [1, -1],
        [2, -1],
      ]),
    )
  })

  it('falls back to the item detail cache', () => {
    const client = new QueryClient()
    client.setQueryData(['item', 'item9'], { id: 9, feed_id: 3, is_read: false } as ItemDetail)
    expect(collectUnreadDeltas(client, [9], true)).toEqual(new Map([[3, -1]]))
  })

  it('returns null when an id is missing from the cache', () => {
    const client = clientWithList([summary(1, false)])
    expect(collectUnreadDeltas(client, [1, 99], true)).toBeNull()
  })
})

describe('patchBootstrapUnread', () => {
  it('applies the deltas and recomputes the total', () => {
    const client = new QueryClient()
    client.setQueryData(
      queryKeys.bootstrap,
      bootstrapWith([
        { id: 1, unread_count: 5 },
        { id: 2, unread_count: 3 },
      ]),
    )

    patchBootstrapUnread(
      client,
      new Map([
        [1, -2],
        [2, 1],
      ]),
    )

    const bootstrap = client.getQueryData<Bootstrap>(queryKeys.bootstrap)
    expect(bootstrap?.feeds.map((feed) => feed.unread_count)).toEqual([3, 4])
    expect(bootstrap?.unread_count).toBe(7)
  })

  it('never lets a feed go below zero', () => {
    const client = new QueryClient()
    client.setQueryData(queryKeys.bootstrap, bootstrapWith([{ id: 1, unread_count: 1 }]))

    patchBootstrapUnread(client, new Map([[1, -3]]))

    const bootstrap = client.getQueryData<Bootstrap>(queryKeys.bootstrap)
    expect(bootstrap?.feeds[0]?.unread_count).toBe(0)
    expect(bootstrap?.unread_count).toBe(0)
  })
})

describe('holdStreamItems', () => {
  it('keeps rows the server dropped after they were marked read', () => {
    const previous = [summary(1, true), summary(2, false)]
    const fetched = [summary(2, false)]
    expect(holdStreamItems(previous, fetched).map((item) => item.id)).toEqual([1, 2])
  })

  it('appends newly fetched rows for the next page', () => {
    const previous = [summary(1, false)]
    const fetched = [summary(1, false), summary(2, false)]
    expect(holdStreamItems(previous, fetched).map((item) => item.id)).toEqual([1, 2])
  })

  it('updates read state from the fetched row when it is still present', () => {
    const previous = [summary(1, false), summary(2, false)]
    const fetched = [summary(1, true), summary(2, false)]
    expect(holdStreamItems(previous, fetched).map((item) => item.is_read)).toEqual([true, false])
  })

  it('returns the previous array when nothing changed', () => {
    const previous = [summary(1, true), summary(2, false)]
    expect(holdStreamItems(previous, [summary(2, false)])).toBe(previous)
  })
})
