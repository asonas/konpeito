import { readLocal, writeLocal } from '../storage.ts'

export const DEMO_READ_STORAGE_KEY = 'konpeito:demo:read'

const MAX_ENTRIES = 5000

type ReadMap = Map<number, number>

let enabled = false
let cache: ReadMap | null = null
const feedOfItem = new Map<number, number>()

export function setDemoMode(on: boolean): void {
  enabled = on
  if (!on) {
    cache = null
  }
}

export function isDemoMode(): boolean {
  return enabled
}

function parse(raw: string | null): ReadMap {
  const map: ReadMap = new Map()
  if (raw === null) {
    return map
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || !('read' in parsed)) {
      return map
    }
    const rows = (parsed as { read: unknown }).read
    if (!Array.isArray(rows)) {
      return map
    }
    for (const row of rows) {
      if (Array.isArray(row) && typeof row[0] === 'number' && typeof row[1] === 'number') {
        map.set(row[0], row[1])
      }
    }
  } catch {
    return new Map()
  }
  return map
}

function load(): ReadMap {
  if (cache !== null) {
    return cache
  }
  cache = parse(readLocal(DEMO_READ_STORAGE_KEY))
  return cache
}

function save(map: ReadMap): void {
  let rows = [...map]
  if (rows.length > MAX_ENTRIES) {
    rows = rows.slice(rows.length - MAX_ENTRIES)
    cache = new Map(rows)
  }
  writeLocal(DEMO_READ_STORAGE_KEY, JSON.stringify({ v: 1, read: rows }))
}

export function rememberItems(items: readonly { id: number; feed_id: number }[]): void {
  if (!enabled) {
    return
  }
  for (const item of items) {
    feedOfItem.set(item.id, item.feed_id)
  }
}

export function isItemRead(id: number): boolean {
  return enabled && load().has(id)
}

function applyRead<T extends { id: number; is_read: boolean }>(item: T): T {
  return isItemRead(item.id) ? { ...item, is_read: true } : item
}

export function withDemoItem<T extends { id: number; feed_id: number; is_read: boolean }>(
  item: T,
): T {
  rememberItems([item])
  return applyRead(item)
}

export function withDemoItemList<T extends { id: number; feed_id: number; is_read: boolean }>(
  items: T[],
  stream: string,
): T[] {
  if (!enabled) {
    return items
  }
  rememberItems(items)
  const applied = items.map(applyRead)
  return stream === 'unread' ? applied.filter((item) => !item.is_read) : applied
}

export function setItemsReadLocally(ids: readonly number[], read: boolean): void {
  if (!enabled) {
    return
  }
  const map = load()
  for (const id of ids) {
    if (read) {
      // 上限で削るときに、最近の既読が先に消えないようにする
      map.delete(id)
      map.set(id, feedOfItem.get(id) ?? 0)
    } else {
      map.delete(id)
    }
  }
  save(map)
}

function readCountByFeed(): Map<number, number> {
  const counts = new Map<number, number>()
  if (!enabled) {
    return counts
  }
  for (const feedId of load().values()) {
    counts.set(feedId, (counts.get(feedId) ?? 0) + 1)
  }
  return counts
}

export function withDemoUnread<
  T extends {
    feeds: { id: number; unread_count: number }[]
    unread_count: number
  },
>(bootstrap: T): T {
  if (!enabled) {
    return bootstrap
  }
  const counts = readCountByFeed()
  if (counts.size === 0) {
    return bootstrap
  }
  const feeds = bootstrap.feeds.map((feed) => {
    const read = counts.get(feed.id) ?? 0
    return read === 0 ? feed : { ...feed, unread_count: Math.max(0, feed.unread_count - read) }
  })
  let total = 0
  for (const count of counts.values()) {
    total += count
  }
  return { ...bootstrap, feeds, unread_count: Math.max(0, bootstrap.unread_count - total) }
}
