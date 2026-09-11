import { describe, expect, it } from 'vitest'
import { COMMAS_WITH_JAPANESE, decodeHtml, extractFromHtml, fetchArticleHtml } from './extractor.ts'

/** Shift_JISの「あい」 */
const SJIS_AI = [0x82, 0xa0, 0x82, 0xa2]

function bytes(ascii: string, tail: number[] = []): Uint8Array {
  return new Uint8Array([...new TextEncoder().encode(ascii), ...tail])
}

function deps(fetchFn: typeof fetch) {
  return { fetch: fetchFn, now: () => 1 }
}

describe('decodeHtml', () => {
  it('keeps valid UTF-8 even when the header declares another charset', () => {
    expect(decodeHtml(new TextEncoder().encode('日本語'), 'text/html; charset=Shift_JIS')).toBe(
      '日本語',
    )
  })

  it('decodes Shift_JIS declared in Content-Type', () => {
    expect(decodeHtml(new Uint8Array(SJIS_AI), 'text/html; charset=Shift_JIS')).toBe('あい')
  })

  it('decodes Shift_JIS declared only in a meta element', () => {
    const body = bytes(
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS"></head><body>',
      SJIS_AI,
    )
    expect(decodeHtml(body, 'text/html')).toContain('あい')
    const short = bytes('<html><head><meta charset=shift_jis><body>', SJIS_AI)
    expect(decodeHtml(short, null)).toContain('あい')
  })

  it('falls back to lenient UTF-8 for an unknown label', () => {
    const body = bytes('<p>x</p>', [0xff])
    expect(decodeHtml(body, 'text/html; charset=x-unknown')).toContain('<p>x</p>')
  })
})

describe('fetchArticleHtml', () => {
  it('sends the article headers and returns the decoded page with its final URL', async () => {
    const seen: { headers: Headers | null } = { headers: null }
    const result = await fetchArticleHtml(
      'https://example.com/post',
      deps(async (_input, init) => {
        seen.headers = new Headers(init?.headers)
        return new Response(new Uint8Array(SJIS_AI), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=Shift_JIS' },
        })
      }),
    )
    expect(seen.headers?.get('Accept')).toContain('text/html')
    expect(seen.headers?.get('User-Agent')).toMatch(/^Mozilla\/5\.0 \(compatible; konpeito/)
    expect(result).toEqual({ kind: 'ok', html: 'あい', finalUrl: 'https://example.com/post' })
  })

  it('classifies failures so the reason can be shown and logged', async () => {
    const forbidden = await fetchArticleHtml(
      'https://example.com/post',
      deps(async () => new Response('denied', { status: 403 })),
    )
    expect(forbidden).toEqual({ kind: 'failed', reason: 'http_403' })

    const pdf = await fetchArticleHtml(
      'https://example.com/post.pdf',
      deps(
        async () =>
          new Response('%PDF-1.7', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
      ),
    )
    expect(pdf).toEqual({ kind: 'failed', reason: 'not_html' })

    const plain = await fetchArticleHtml(
      'https://example.com/post',
      deps(async () => new Response('no article here', { status: 200 })),
    )
    expect(plain).toEqual({ kind: 'failed', reason: 'not_html' })

    const timeout = await fetchArticleHtml(
      'https://example.com/post',
      deps(async () => {
        throw new DOMException('timed out', 'TimeoutError')
      }),
    )
    expect(timeout).toEqual({ kind: 'failed', reason: 'timeout' })

    const ssrf = await fetchArticleHtml(
      'http://127.0.0.1/post',
      deps(async () => new Response('<html></html>', { status: 200 })),
    )
    expect(ssrf).toEqual({ kind: 'failed', reason: 'ssrf_blocked' })
  })
})

describe('extractFromHtml', () => {
  it('counts Japanese commas alongside the default ones', () => {
    expect('あ、い，う,え'.match(COMMAS_WITH_JAPANESE)?.length).toBe(3)
  })

  it('extracts a Japanese article body and drops navigation', async () => {
    const paragraph =
      '<p>これは本文の段落で、読点を多く含み、句点で終わる。日本語の記事では、カンマではなく読点が使われる。段落は十分な長さを持ち、抽出の対象になる。</p>'
    const html = `<!doctype html><html lang="ja"><head><title>記事</title></head><body>
      <nav><ul><li><a href="/">ホーム</a></li><li><a href="/about">サイト案内</a></li></ul></nav>
      <article><h1>見出し</h1>${paragraph.repeat(6)}</article>
      <aside><ul><li><a href="/a">関連記事A</a></li><li><a href="/b">関連記事B</a></li></ul></aside>
    </body></html>`
    const extracted = await extractFromHtml(html, 'https://example.com/post')
    expect(extracted).not.toBeNull()
    expect(extracted).toContain('これは本文の段落で')
    expect(extracted).not.toContain('サイト案内')
  })
})
