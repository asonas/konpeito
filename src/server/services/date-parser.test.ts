import { describe, expect, it } from 'vitest'
import { parseFeedDate } from './date-parser.ts'

describe('parseFeedDate', () => {
  it('rewrites the timezone abbreviations Date.parse does not know', () => {
    expect(parseFeedDate('Wed, 01 Jan 2020 09:00:00 JST')).toBe(1577836800)
    expect(parseFeedDate('Wed, 01 Jan 2020 00:00:00 PST')).toBe(1577836800 + 8 * 3600)
    expect(parseFeedDate('Wed, 01 Jan 2020 00:00:00 UT')).toBe(1577836800)
  })

  it('parses nonstandard slash dates and missing zeros', () => {
    expect(parseFeedDate('2020/1/1 00:00:00')).toBe(1577836800)
    expect(parseFeedDate('Mon, 1 Jan 2020 00:00:00 GMT')).toBe(1577836800)
  })

  it('parses unix seconds', () => {
    expect(parseFeedDate('1577836800')).toBe(1577836800)
  })

  it('returns null for garbage', () => {
    expect(parseFeedDate('not a date')).toBeNull()
    expect(parseFeedDate('')).toBeNull()
  })
})
