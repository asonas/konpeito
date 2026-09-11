import { describe, expect, it } from 'vitest'
import { applyArticleLinks } from './article-links.ts'

function render(html: string): HTMLDivElement {
  const root = document.createElement('div')
  root.innerHTML = html
  applyArticleLinks(root)
  return root
}

describe('applyArticleLinks', () => {
  it('turns bare http urls into new-tab links', () => {
    const root = render('<p>見て https://example.com/foo これ</p>')
    const link = root.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://example.com/foo')
    expect(link?.textContent).toBe('https://example.com/foo')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link?.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(root.textContent).toBe('見て https://example.com/foo これ')
  })

  it('keeps trailing punctuation outside the link', () => {
    const root = render('<p>https://example.com/foo。</p>')
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://example.com/foo')
    expect(root.textContent).toBe('https://example.com/foo。')
  })

  it('keeps balanced parentheses in the url', () => {
    const root = render('<p>https://example.com/wiki/Foo_(bar)</p>')
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://example.com/wiki/Foo_(bar)')
  })

  it('does not wrap urls that are already links', () => {
    const root = render('<p><a href="https://example.com/x">https://example.com/x</a></p>')
    expect(root.querySelectorAll('a')).toHaveLength(1)
    expect(root.querySelector('a')?.getAttribute('target')).toBe('_blank')
  })

  it('does not linkify urls inside code', () => {
    const root = render('<p><code>https://example.com/x</code></p>')
    expect(root.querySelector('a')).toBeNull()
  })

  it('linkifies mailto urls', () => {
    const root = render('<p>mailto:hi@example.com</p>')
    expect(root.querySelector('a')?.getAttribute('href')).toBe('mailto:hi@example.com')
    expect(root.querySelector('a')?.getAttribute('target')).toBe('_blank')
  })

  it('linkifies multiple urls in one text node', () => {
    const root = render('<p>https://a.example/x and https://b.example/y</p>')
    const hrefs = [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['https://a.example/x', 'https://b.example/y'])
  })
})
