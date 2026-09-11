import { describe, expect, it } from 'vitest'
import { diffArticleHtml } from './article-diff.ts'

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
}

function texts(html: string, selector: string): string[] {
  return [...parse(html).querySelectorAll(selector)].map((el) => el.textContent ?? '')
}

describe('diffArticleHtml', () => {
  it('does not mark identical html', () => {
    const html = diffArticleHtml('<p>同じ本文です。</p>', '<p>同じ本文です。</p>')
    expect(html).not.toMatch(/<ins|<del/)
    expect(parse(html).querySelector('p')?.textContent).toBe('同じ本文です。')
  })

  it('marks an added japanese sentence in place', () => {
    const html = diffArticleHtml('<p>今日は晴れです。</p>', '<p>今日は晴れです。明日は雨です。</p>')
    expect(texts(html, 'ins')).toEqual(['明日は雨です。'])
    expect(texts(html, 'del')).toEqual([])
    expect(parse(html).querySelector('p')?.textContent).toBe('今日は晴れです。明日は雨です。')
  })

  it('marks a deleted japanese sentence with del', () => {
    const html = diffArticleHtml('<p>今日は晴れです。明日は雨です。</p>', '<p>今日は晴れです。</p>')
    expect(texts(html, 'del')).toEqual(['明日は雨です。'])
    expect(texts(html, 'ins')).toEqual([])
  })

  it('marks a replaced sentence as delete then insert', () => {
    const html = diffArticleHtml(
      '<p>今日は晴れです。明日は雨です。</p>',
      '<p>今日は晴れです。明日は雪です。</p>',
    )
    expect(texts(html, 'del')).toEqual(['明日は雨です。'])
    expect(texts(html, 'ins')).toEqual(['明日は雪です。'])
    const body = parse(html).querySelector('#root')?.innerHTML ?? ''
    expect(body.indexOf('<del')).toBeLessThan(body.indexOf('<ins'))
  })

  it('wraps an added paragraph', () => {
    const html = diffArticleHtml('<p>前</p>', '<p>前</p><p>追加の段落</p>')
    expect(texts(html, 'ins')).toEqual(['追加の段落'])
    expect(parse(html).querySelector('ins')?.querySelector('p')?.textContent).toBe('追加の段落')
  })

  it('wraps a removed paragraph', () => {
    const html = diffArticleHtml('<p>残す</p><p>消す</p>', '<p>残す</p>')
    expect(texts(html, 'del')).toEqual(['消す'])
    expect(parse(html).querySelector('del')?.querySelector('p')?.textContent).toBe('消す')
  })

  it('keeps links on unchanged text', () => {
    const html = diffArticleHtml(
      '<p>見て <a href="https://example.com/a">リンク</a> です。</p>',
      '<p>見て <a href="https://example.com/a">リンク</a> です。追記。</p>',
    )
    const anchor = parse(html).querySelector('a')
    expect(anchor?.getAttribute('href')).toBe('https://example.com/a')
    expect(anchor?.textContent).toBe('リンク')
    expect(texts(html, 'ins').join('')).toContain('追記。')
  })

  it('uses article-diff class names for styling', () => {
    const html = diffArticleHtml('<p>旧</p>', '<p>新</p>')
    expect(parse(html).querySelector('del')?.className).toBe('article-diff-del')
    expect(parse(html).querySelector('ins')?.className).toBe('article-diff-add')
  })
})
