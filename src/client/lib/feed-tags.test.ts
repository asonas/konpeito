import { describe, expect, it } from 'vitest'
import { replaceFeedTag } from './feed-tags.ts'

describe('replaceFeedTag', () => {
  it('replaces the tag the row was dragged from', () => {
    expect(replaceFeedTag([1], 1, 2)).toEqual([2])
  })

  it('keeps the tags the row was not dragged from', () => {
    expect(replaceFeedTag([1, 2], 1, 3)).toEqual([2, 3])
  })

  it('drops the tag when moved to the uncategorized section', () => {
    expect(replaceFeedTag([1, 2], 1, null)).toEqual([2])
  })

  it('adds the tag when dragged out of the uncategorized section', () => {
    expect(replaceFeedTag([], null, 1)).toEqual([1])
  })

  it('does not duplicate a tag the feed already has', () => {
    expect(replaceFeedTag([1, 2], 1, 2)).toEqual([2])
  })
})
