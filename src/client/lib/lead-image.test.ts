import { describe, expect, it } from 'vitest'
import { feedShowsLeadImage, leadImageToShow } from './lead-image.ts'

describe('feedShowsLeadImage', () => {
  it('follows the matching feed and defaults to showing', () => {
    const feeds = [
      { id: 1, show_lead_image: 1 },
      { id: 2, show_lead_image: 0 },
    ]
    expect(feedShowsLeadImage(feeds, 1)).toBe(true)
    expect(feedShowsLeadImage(feeds, 2)).toBe(false)
    expect(feedShowsLeadImage(feeds, 3)).toBe(true)
    expect(feedShowsLeadImage([{ id: 4 }], 4)).toBe(true)
  })
})

describe('leadImageToShow', () => {
  it('returns the lead image when the body has no image', () => {
    expect(leadImageToShow('<p>本文</p>', 'https://example.com/og.png')).toBe(
      'https://example.com/og.png',
    )
  })

  it('returns null when the first body image is the same URL', () => {
    expect(
      leadImageToShow(
        '<p><img src="https://example.com/og.png"></p>',
        'https://example.com/og.png',
      ),
    ).toBeNull()
  })

  it('returns the lead image when the first body image is a different URL', () => {
    expect(
      leadImageToShow(
        '<p><img src="https://example.com/other.png"></p>',
        'https://example.com/og.png',
      ),
    ).toBe('https://example.com/og.png')
  })

  it('returns null when there is no lead image', () => {
    expect(leadImageToShow('<p>本文</p>', null)).toBeNull()
    expect(leadImageToShow('<p>本文</p>', '')).toBeNull()
  })
})
