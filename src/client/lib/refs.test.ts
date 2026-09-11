import { describe, expect, it } from 'vitest'
import { itemMatches, itemRefOf, publicIdOf } from './refs.ts'

describe('item refs', () => {
  it('prefers public_id and falls back to the numeric id', () => {
    expect(itemRefOf({ id: 12, public_id: 'rq2pghwuyy' })).toBe('rq2pghwuyy')
    expect(itemRefOf({ id: 12, public_id: null })).toBe('12')
    expect(itemRefOf({ id: 12, public_id: '' })).toBe('12')
    expect(publicIdOf({ public_id: '' })).toBeUndefined()
  })

  it('matches public and numeric refs', () => {
    const item = { id: 12, public_id: 'rq2pghwuyy' }
    expect(itemMatches(item, 'rq2pghwuyy')).toBe(true)
    expect(itemMatches(item, '12')).toBe(true)
    expect(itemMatches(item, '99')).toBe(false)
    expect(itemMatches(item, undefined)).toBe(false)
  })
})
