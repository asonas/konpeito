import { describe, expect, it } from 'vitest'
import { allocatePublicId, feedPublicId, PublicIdError } from './public-id.ts'

describe('public IDs', () => {
  it('stays in the base32 alphabet and lengthens the digest when attempt increases', () => {
    const url = 'https://example.com/feed.xml'
    expect(feedPublicId(url, 0)).toMatch(/^[a-z2-7]+$/)
    expect(feedPublicId(url, 1).startsWith(feedPublicId(url, 0))).toBe(true)
    expect(feedPublicId(url, 1).length).toBeGreaterThan(feedPublicId(url, 0).length)
  })
})

describe('allocatePublicId', () => {
  it('skips an all-digit id, which would be read as a numeric id in the URL', () => {
    const tried: string[] = []
    const generate = (attempt: number) => {
      const value = attempt === 0 ? '12345' : `id${attempt}`
      tried.push(value)
      return value
    }
    expect(allocatePublicId(generate)).toBe('id1')
    expect(tried).toEqual(['12345', 'id1'])
  })

  it('tries the next attempt when the id is already taken', () => {
    const used = new Set(['id0'])
    expect(allocatePublicId((attempt) => `id${attempt}`, used)).toBe('id1')
    expect(used.has('id1')).toBe(true)
  })

  it('gives up instead of looping forever when every attempt collides', () => {
    expect(() => allocatePublicId(() => '1', new Set())).toThrow(PublicIdError)
  })
})
