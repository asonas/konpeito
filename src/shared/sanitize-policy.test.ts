import { describe, expect, it } from 'vitest'
import { toDOMPurifyConfig } from './sanitize-policy.ts'

describe('toDOMPurifyConfig', () => {
  it('allows the relative image proxy url and non-url attribute values', () => {
    const { ALLOWED_URI_REGEXP: re } = toDOMPurifyConfig()
    expect(re.test('/img?u=aHR0cHM6Ly9leGFtcGxlLmNvbS9hLnBuZw&s=abc')).toBe(true)
    expect(re.test('https://example.com/a.png')).toBe(true)
    expect(re.test('data:image/png;base64,AAAA')).toBe(true)
    expect(re.test('lazy')).toBe(true)
    expect(re.test('600')).toBe(true)
  })

  it('still rejects script and non-image data urls', () => {
    const { ALLOWED_URI_REGEXP: re } = toDOMPurifyConfig()
    expect(re.test('javascript:alert(1)')).toBe(false)
    expect(re.test('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(re.test('vbscript:msgbox(1)')).toBe(false)
  })
})
