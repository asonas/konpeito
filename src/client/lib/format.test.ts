import { describe, expect, it } from 'vitest'
import { formatBytes, formatDateTime, formatRelative } from './format.ts'

describe('formatDateTime', () => {
  it('日本時間で、時刻と日付を中黒でつなぐ', () => {
    const [time, date] = formatDateTime(Date.UTC(2026, 3, 23, 6, 6) / 1000, 'en').split(' · ')
    // UTCでは4月23日6時。日本時間なら同じ日の15時
    expect(time).toContain('3:06')
    expect(date).toContain('Apr 23')
    expect(date).toContain('2026')
  })

  it('日付をまたぐずれも日本時間で持ち上げる', () => {
    // UTCでは4月23日16時、日本時間では4月24日1時
    const [, date] = formatDateTime(Date.UTC(2026, 3, 23, 16, 0) / 1000, 'en').split(' · ')
    expect(date).toContain('Apr 24')
  })
})

describe('formatRelative', () => {
  it('1分未満はたった今', () => {
    expect(formatRelative(1_000, 1_030, 'en')).toBe('Just now')
  })

  it('1時間未満は分、1日未満は時間、7日未満は日で表す', () => {
    expect(formatRelative(0, 60 * 5, 'en')).toBe('5 min ago')
    expect(formatRelative(0, 3600 * 3, 'en')).toBe('3 hr ago')
    expect(formatRelative(0, 86400 * 6, 'en')).toBe('6 days ago')
  })

  it('7日を超えたら日本時間の英語日付にする', () => {
    expect(formatRelative(1_700_000_000, 1_700_000_000 + 86400 * 8, 'en')).toBe('Nov 15, 2023')
  })
})

describe('formatBytes', () => {
  it('単位を切り替える', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(formatBytes(1024 ** 3)).toBe('1.00 GB')
  })
})
