import { describe, expect, it } from 'vitest'
import { moveToFront } from './order.ts'

describe('moveToFront', () => {
  it('moves the given id to the front', () => {
    expect(moveToFront([1, 2, 3], 3)).toEqual([3, 1, 2])
    expect(moveToFront([1, 2, 3], 1)).toEqual([1, 2, 3])
  })

  it('returns the original array when the id is not included', () => {
    const ids = [1, 2, 3]
    expect(moveToFront(ids, 9)).toBe(ids)
  })
})
