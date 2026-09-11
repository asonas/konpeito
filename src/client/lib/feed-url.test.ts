import { describe, expect, it } from 'vitest'
import { normalizeFeedInput } from './feed-url.ts'

describe('normalizeFeedInput', () => {
  it('keeps a normal URL', () => {
    expect(normalizeFeedInput('https://shikakun.com/feed.xml')).toBe(
      'https://shikakun.com/feed.xml',
    )
  })

  it('trims and completes a missing scheme', () => {
    expect(normalizeFeedInput('  shikakun.com/feed.xml ')).toBe('https://shikakun.com/feed.xml')
  })

  it('reads feed: as https', () => {
    expect(normalizeFeedInput('feed://shikakun.com/feed.xml')).toBe('https://shikakun.com/feed.xml')
  })

  it('keeps http as it is', () => {
    expect(normalizeFeedInput('http://shikakun.com/')).toBe('http://shikakun.com/')
  })

  it('rejects what is not a web address', () => {
    expect(normalizeFeedInput('')).toBeNull()
    expect(normalizeFeedInput('   ')).toBeNull()
    expect(normalizeFeedInput('shikakun')).toBeNull()
    expect(normalizeFeedInput('javascript:alert(1)')).toBeNull()
    expect(normalizeFeedInput('mailto:shikakun@example.com')).toBeNull()
  })
})
