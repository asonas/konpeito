import { describe, expect, it } from 'vitest'
import { displayLayout } from './layout.ts'

describe('displayLayout', () => {
  it('falls back to two columns only when a wide viewport undocks the sidebar', () => {
    expect(displayLayout('three', true)).toBe('three')
    expect(displayLayout('three', false)).toBe('two')
  })

  it('does not promote a narrower viewport to three columns', () => {
    expect(displayLayout('two', true)).toBe('two')
    expect(displayLayout('one', true)).toBe('one')
  })
})
