import { describe, expect, it } from 'vitest'
import { absolutizeImageProxyUrls } from './urls.ts'

const ORIGIN = 'https://konpeito.example'

describe('absolutizeImageProxyUrls', () => {
  it('prefixes quoted src and srcset candidates', () => {
    expect(absolutizeImageProxyUrls('<img src="/img?u=a&s=b">', ORIGIN)).toBe(
      `<img src="${ORIGIN}/img?u=a&s=b">`,
    )
    expect(
      absolutizeImageProxyUrls('<img srcset="/img?u=a&s=b 1x, /img?u=c&s=d 2x">', ORIGIN),
    ).toBe(`<img srcset="${ORIGIN}/img?u=a&s=b 1x, ${ORIGIN}/img?u=c&s=d 2x">`)
  })

  it('leaves already-absolute proxy urls unchanged', () => {
    const html = `<img src="${ORIGIN}/img?u=a&s=b">`
    expect(absolutizeImageProxyUrls(html, ORIGIN)).toBe(html)
  })

  it('prefixes an unquoted src and leaves empty html unchanged', () => {
    expect(absolutizeImageProxyUrls('<img src=/img?u=a&s=b>', ORIGIN)).toBe(
      `<img src=${ORIGIN}/img?u=a&s=b>`,
    )
    expect(absolutizeImageProxyUrls('', ORIGIN)).toBe('')
  })
})
