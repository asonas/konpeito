import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubLocalStorage } from '../storage.test-helper.ts'
import {
  DEMO_READ_STORAGE_KEY,
  isItemRead,
  rememberItems,
  setDemoMode,
  setItemsReadLocally,
  withDemoItemList,
  withDemoUnread,
} from './read-store.ts'

let memory = new Map<string, string>()

function itemOf(id: number, feedId: number) {
  return { id, feed_id: feedId, is_read: false }
}

function bootstrapOf() {
  return {
    feeds: [
      { id: 1, unread_count: 20 },
      { id: 2, unread_count: 10 },
    ],
    unread_count: 30,
  }
}

describe('read-store', () => {
  beforeEach(() => {
    memory = stubLocalStorage()
    setDemoMode(true)
  })

  afterEach(() => {
    setDemoMode(false)
    vi.unstubAllGlobals()
  })

  it('does nothing while disabled', () => {
    setDemoMode(false)
    setItemsReadLocally([1], true)
    expect(isItemRead(1)).toBe(false)
    expect(memory.has(DEMO_READ_STORAGE_KEY)).toBe(false)
  })

  it('keeps the read state on this device', () => {
    rememberItems([itemOf(1, 1)])
    setItemsReadLocally([1], true)
    expect(isItemRead(1)).toBe(true)
    setItemsReadLocally([1], false)
    expect(isItemRead(1)).toBe(false)
  })

  it('drops read articles from the unread stream and leaves other streams alone', () => {
    const items = [itemOf(1, 1), itemOf(2, 1)]
    rememberItems(items)
    setItemsReadLocally([1], true)
    expect(withDemoItemList(items, 'unread').map((item) => item.id)).toEqual([2])
    const all = withDemoItemList(items, 'all')
    expect(all.map((item) => item.id)).toEqual([1, 2])
    expect(all[0]?.is_read).toBe(true)
  })

  it('subtracts the read count from each feed and from the total', () => {
    rememberItems([itemOf(1, 1), itemOf(2, 1), itemOf(3, 2)])
    setItemsReadLocally([1, 2, 3], true)
    const next = withDemoUnread(bootstrapOf())
    expect(next.feeds[0]?.unread_count).toBe(18)
    expect(next.feeds[1]?.unread_count).toBe(9)
    expect(next.unread_count).toBe(27)
  })

  it('counts an article whose feed is unknown in the total only', () => {
    setItemsReadLocally([99], true)
    const next = withDemoUnread(bootstrapOf())
    expect(next.feeds[0]?.unread_count).toBe(20)
    expect(next.unread_count).toBe(29)
  })

  it('never goes below zero', () => {
    rememberItems([itemOf(1, 2)])
    setItemsReadLocally([1], true)
    const next = withDemoUnread({ feeds: [{ id: 2, unread_count: 0 }], unread_count: 0 })
    expect(next.feeds[0]?.unread_count).toBe(0)
    expect(next.unread_count).toBe(0)
  })

  it('reads back what an earlier visit stored', () => {
    rememberItems([itemOf(7, 1)])
    setItemsReadLocally([7], true)
    setDemoMode(false)
    setDemoMode(true)
    expect(isItemRead(7)).toBe(true)
  })

  it('survives storage that cannot be read', () => {
    memory.set(DEMO_READ_STORAGE_KEY, 'not json')
    setDemoMode(false)
    setDemoMode(true)
    expect(isItemRead(1)).toBe(false)
  })
})
