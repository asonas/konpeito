import { describe, expect, it } from 'vitest'
import { cleanTrackingParams } from './url-cleaner.ts'

const hosts = { feedHost: 'example.com', siteHost: 'blog.example.com' }

describe('cleanTrackingParams', () => {
  it('removes prefix and exact tracking params', () => {
    const url = 'https://example.com/p?utm_source=rss&fbclid=1&keep=yes'
    expect(cleanTrackingParams(url, hosts)).toBe('https://example.com/p?keep=yes')
  })

  it('leaves URLs without tracking params unchanged', () => {
    const url = 'https://example.com/p?b=2&a=1#frag'
    expect(cleanTrackingParams(url, hosts)).toBe(url)
  })

  it('removes ref only when it matches feed or site host', () => {
    const matching = 'https://other.com/x?ref=example.com'
    expect(cleanTrackingParams(matching, hosts)).toBe('https://other.com/x')
    const site = 'https://other.com/x?ref=blog.example.com'
    expect(cleanTrackingParams(site, hosts)).toBe('https://other.com/x')
    const keep = 'https://other.com/x?ref=elsewhere'
    expect(cleanTrackingParams(keep, hosts)).toBe(keep)
  })
})
