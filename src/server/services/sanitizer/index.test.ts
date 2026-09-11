import { describe, expect, it } from 'vitest'
import allowlistIn from '../../../../test/fixtures/synthetic/allowlist.in.html?raw'
import allowlistOut from '../../../../test/fixtures/synthetic/allowlist.out.html?raw'
import lazyImages from '../../../../test/fixtures/synthetic/lazy-images.html?raw'
import lazyImagesOut from '../../../../test/fixtures/synthetic/lazy-images.out.html?raw'
import { plaintextHtml } from './html.ts'
import { sanitizeContent } from './index.ts'

const ctx = {
  baseUrl: 'https://example.com/post',
  feedHost: 'example.com',
  siteHost: 'example.com',
  imageProxy: (url: string) => `/img?u=${encodeURIComponent(url)}`,
  language: 'ja',
}

describe('sanitizeContent', () => {
  it('reports a summary and a lead image alongside the html', () => {
    const result = sanitizeContent(lazyImages, ctx)
    expect(result.summary.length).toBeGreaterThan(0)
    expect(result.leadImageUrl).toContain('/img?u=')
  })

  it('keeps separate paragraphs instead of falling back to a single p', () => {
    const result = sanitizeContent('<p>a</p><p>b</p>', ctx)
    expect(result.html.match(/<p>/g)?.length).toBe(2)
    expect(result.html).toContain('<p>a</p>')
    expect(result.html).toContain('<p>b</p>')
  })

  it('keeps wbr as an element', () => {
    const result = sanitizeContent('<p>こんにちは。<wbr></wbr>世界</p>', ctx)
    expect(result.html).toContain('<wbr')
    expect(result.html).toContain('こんにちは。')
    expect(result.html).toContain('世界')
    expect(result.summary).toBe('こんにちは。世界')
  })

  it('runs bare urls through the shared linkifier', () => {
    const result = sanitizeContent('<p>見て https://example.com/foo これ</p>', ctx)
    expect(result.html).toContain('href="https://example.com/foo"')
  })

  it('plaintextHtml wraps each paragraph and escapes the text', () => {
    expect(plaintextHtml('<p>a &amp; b</p><p><em>c</em></p>')).toBe('<p>a &amp; b</p><p>c</p>')
  })

  it('matches 8.2-8.5 input/output HTML fixture pairs', () => {
    const pairs = [
      { input: allowlistIn, output: allowlistOut, name: 'allowlist.in.html' },
      { input: lazyImages, output: lazyImagesOut, name: 'lazy-images.html' },
    ]
    for (const pair of pairs) {
      const actual = sanitizeContent(pair.input, ctx).html.trim()
      expect(actual, pair.name).toBe(pair.output.trim())
    }
  })
})
