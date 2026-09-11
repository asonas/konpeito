import { afterEach, describe, expect, it } from 'vitest'
import type { ItemListPage, ItemsPageParams } from '../queries.ts'
import { skipEmptyDemoPages } from './items.ts'
import { setDemoMode } from './read-store.ts'

function paramsOf(stream: ItemsPageParams['stream']): ItemsPageParams {
  return { stream, order: 'desc' }
}

function fetcherOf(pages: ItemListPage[]) {
  const calls: (string | undefined)[] = []
  let index = 0
  return {
    calls,
    fetchPage: (params: ItemsPageParams) => {
      calls.push(params.cursor)
      index += 1
      return Promise.resolve(pages[index] ?? { items: [] })
    },
  }
}

describe('skipEmptyDemoPages', () => {
  afterEach(() => {
    setDemoMode(false)
  })

  it('leaves the page alone outside demo mode', async () => {
    const first: ItemListPage = { items: [], next_cursor: 'c1' }
    const { fetchPage, calls } = fetcherOf([first])
    expect(await skipEmptyDemoPages(first, paramsOf('unread'), fetchPage)).toBe(first)
    expect(calls).toEqual([])
  })

  it('leaves streams other than unread alone', async () => {
    setDemoMode(true)
    const first: ItemListPage = { items: [], next_cursor: 'c1' }
    const { fetchPage, calls } = fetcherOf([first])
    expect(await skipEmptyDemoPages(first, paramsOf('all'), fetchPage)).toBe(first)
    expect(calls).toEqual([])
  })

  it('walks on until a page has items', async () => {
    setDemoMode(true)
    const pages: ItemListPage[] = [
      { items: [], next_cursor: 'c1' },
      { items: [], next_cursor: 'c2' },
      { items: [{ id: 1 }] as ItemListPage['items'] },
    ]
    const { fetchPage, calls } = fetcherOf(pages)
    const result = await skipEmptyDemoPages(pages[0] as ItemListPage, paramsOf('unread'), fetchPage)
    expect(result.items).toHaveLength(1)
    expect(calls).toEqual(['c1', 'c2'])
  })

  it('stops at the last page', async () => {
    setDemoMode(true)
    const first: ItemListPage = { items: [], next_cursor: 'c1' }
    const { fetchPage, calls } = fetcherOf([first, { items: [] }])
    const result = await skipEmptyDemoPages(first, paramsOf('unread'), fetchPage)
    expect(result.items).toEqual([])
    expect(calls).toEqual(['c1'])
  })

  it('gives up after the page limit, even when the cursor never ends', async () => {
    setDemoMode(true)
    const endless: ItemListPage = { items: [], next_cursor: 'c' }
    const calls: (string | undefined)[] = []
    const result = await skipEmptyDemoPages(endless, paramsOf('unread'), (params) => {
      calls.push(params.cursor)
      return Promise.resolve(endless)
    })
    expect(result.items).toEqual([])
    expect(calls).toHaveLength(10)
  })
})
