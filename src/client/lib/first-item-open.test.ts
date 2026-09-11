import { describe, expect, it } from 'vitest'
import { resolveFirstItemOpen } from './first-item-open.ts'

const ready = {
  initialized: true,
  sourceChanged: true,
  forced: false,
  isLoading: false,
  hasFirstItem: true,
  itemAlreadyInList: false,
  itemRefSet: false,
  layout: 'three' as const,
}

describe('resolveFirstItemOpen', () => {
  it('does not open on the first mount so a bare source URL stays a list', () => {
    expect(resolveFirstItemOpen({ ...ready, initialized: false })).toBe('ignore')
  })

  it('opens the first item after the source changes on a wide layout', () => {
    expect(resolveFirstItemOpen(ready)).toBe('open')
    expect(resolveFirstItemOpen({ ...ready, layout: 'two' })).toBe('open')
  })

  it('selects the first row on one column without leaving the list', () => {
    expect(resolveFirstItemOpen({ ...ready, layout: 'one' })).toBe('select')
  })

  it('waits until the stream has loaded', () => {
    expect(resolveFirstItemOpen({ ...ready, isLoading: true })).toBe('wait')
  })

  it('waits for a sidebar click to drop the current item from the URL', () => {
    expect(
      resolveFirstItemOpen({
        ...ready,
        sourceChanged: false,
        forced: true,
        itemRefSet: true,
        itemAlreadyInList: true,
      }),
    ).toBe('wait')
  })

  it('keeps a deep-linked item when the source first appears', () => {
    expect(
      resolveFirstItemOpen({
        ...ready,
        itemAlreadyInList: true,
        itemRefSet: true,
      }),
    ).toBe('ignore')
  })

  it('does not reopen after the reader closes an article', () => {
    expect(
      resolveFirstItemOpen({
        ...ready,
        sourceChanged: false,
        forced: false,
        itemRefSet: false,
      }),
    ).toBe('ignore')
  })

  it('opens the first item when the sidebar forces a pick', () => {
    expect(
      resolveFirstItemOpen({
        ...ready,
        sourceChanged: false,
        forced: true,
        itemAlreadyInList: true,
      }),
    ).toBe('open')
  })
})
