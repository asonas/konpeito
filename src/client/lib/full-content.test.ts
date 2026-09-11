import { describe, expect, it } from 'vitest'
import {
  feedDefaultOf,
  fullContentFailureMessage,
  resolveFullContentShown,
} from './full-content.ts'
import { ApiError } from './http.ts'

describe('resolveFullContentShown', () => {
  it('never shows full content that does not exist yet', () => {
    expect(
      resolveFullContentShown({ hasFullContent: false, feedDefault: true, override: true }),
    ).toBe(false)
  })

  it('follows the feed default until the reader toggles', () => {
    expect(
      resolveFullContentShown({ hasFullContent: true, feedDefault: true, override: undefined }),
    ).toBe(true)
    expect(
      resolveFullContentShown({ hasFullContent: true, feedDefault: false, override: undefined }),
    ).toBe(false)
  })

  it('lets the per-item toggle override the feed default in both directions', () => {
    expect(
      resolveFullContentShown({ hasFullContent: true, feedDefault: true, override: false }),
    ).toBe(false)
    expect(
      resolveFullContentShown({ hasFullContent: true, feedDefault: false, override: true }),
    ).toBe(true)
  })
})

describe('feedDefaultOf', () => {
  it('reads fetch_full_content of the matching feed', () => {
    const feeds = [
      { id: 1, fetch_full_content: 0 },
      { id: 2, fetch_full_content: 1 },
    ]
    expect(feedDefaultOf(feeds, 1)).toBe(false)
    expect(feedDefaultOf(feeds, 2)).toBe(true)
    expect(feedDefaultOf(feeds, 3)).toBe(false)
  })
})

describe('fullContentFailureMessage', () => {
  it('translates the server reason into the current locale', () => {
    expect(
      fullContentFailureMessage(
        new ApiError(422, 'extract_failed', 'Failed to extract full content (http_403)'),
      ),
    ).toBe('Couldn’t load the full article (HTTP 403)')
    expect(
      fullContentFailureMessage(
        new ApiError(422, 'extract_failed', 'Failed to extract full content (extract)'),
      ),
    ).toBe('Couldn’t load the full article (couldn’t find the article text)')
  })

  it('falls back to the plain message for other errors', () => {
    expect(fullContentFailureMessage(new Error('boom'))).toBe('Couldn’t load the full article')
    expect(
      fullContentFailureMessage(new ApiError(422, 'extract_failed', 'Failed (mystery_reason)')),
    ).toBe('Couldn’t load the full article')
  })
})
