import { api } from '../api.ts'
import { throwIfNotOk } from '../http.ts'
import type { ItemListPage, ItemsPageParams, MarkAllReadBody } from '../queries.ts'
import { isDemoMode, rememberItems, setItemsReadLocally } from './read-store.ts'

const EMPTY_PAGE_LIMIT = 10

const MARK_ALL_PAGE_LIMIT = 10

export async function skipEmptyDemoPages(
  page: ItemListPage,
  params: ItemsPageParams,
  fetchPage: (params: ItemsPageParams) => Promise<ItemListPage>,
): Promise<ItemListPage> {
  if (!isDemoMode() || params.stream !== 'unread') {
    return page
  }
  let current = page
  for (let i = 0; current.items.length === 0 && i < EMPTY_PAGE_LIMIT; i += 1) {
    const cursor = current.next_cursor
    if (cursor === undefined) {
      break
    }
    current = await fetchPage({ ...params, cursor })
  }
  return current
}

export async function markStreamReadLocally(body: MarkAllReadBody): Promise<void> {
  const ids: number[] = []
  let cursor: string | undefined
  for (let page = 0; page < MARK_ALL_PAGE_LIMIT; page += 1) {
    const query: Record<string, string> = { stream: body.stream, order: 'desc', limit: '200' }
    if (body.feed_id !== undefined) {
      query.feed_id = String(body.feed_id)
    }
    if (body.tag_id !== undefined) {
      query.tag_id = String(body.tag_id)
    }
    if (cursor !== undefined) {
      query.cursor = cursor
    }
    const res = await api.items.$get({ query })
    if (res.status !== 200) {
      await throwIfNotOk(res)
      throw new Error('items failed')
    }
    const data = await res.json()
    rememberItems(data.items)
    for (const item of data.items) {
      if (item.published_at <= body.before) {
        ids.push(item.id)
      }
    }
    if (!('next_cursor' in data) || typeof data.next_cursor !== 'string') {
      break
    }
    cursor = data.next_cursor
  }
  setItemsReadLocally(ids, true)
}
