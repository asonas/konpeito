import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SafeHtml } from './SafeHtml.tsx'

/**
 * jsdomにはSanitizer APIが無いのでDOMPurifyで分岐する
 * DOMPurifyは動的に`import()`で読むので、挿入が終わるまで待つ
 */
async function render(html: string): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(<SafeHtml html={html} lang="ja" />)
  })
  await vi.waitFor(() => {
    expect(host.firstElementChild?.childElementCount ?? 0).toBeGreaterThan(0)
  })
  return host
}

describe('SafeHtml', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('renders sanitized html without using the React inner HTML prop', async () => {
    const host = await render('<p>こんにちは<script>alert(1)</script></p>')
    expect(host.querySelector('p')?.textContent).toBe('こんにちは')
    expect(host.querySelector('script')).toBeNull()
  })

  it('keeps existing anchors as new-tab links', async () => {
    const host = await render('<p><a href="https://example.com/bar">bar</a></p>')
    const link = host.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://example.com/bar')
    expect(link?.textContent).toBe('bar')
    expect(link?.getAttribute('target')).toBe('_blank')
  })

  it('keeps the src of proxied images', async () => {
    const host = await render(
      '<p><img src="/img?u=aHR0cHM6Ly9leGFtcGxlLmNvbS9hLnBuZw&amp;s=abc" alt="猫" loading="lazy" decoding="async" width="600"></p>',
    )
    const img = host.querySelector('img')
    expect(img?.getAttribute('src')).toBe('/img?u=aHR0cHM6Ly9leGFtcGxlLmNvbS9hLnBuZw&s=abc')
    expect(img?.getAttribute('alt')).toBe('猫')
    expect(img?.getAttribute('loading')).toBe('lazy')
    expect(img?.getAttribute('width')).toBe('600')
  })

  it('drops javascript urls on anchors', async () => {
    const host = await render('<p><a href="javascript:alert(1)">x</a></p>')
    expect(host.querySelector('a')?.getAttribute('href')).toBeNull()
  })

  it('turns embed placeholders into iframes', async () => {
    const host = await render(
      '<p><button type="button" data-embed-url="https://www.youtube-nocookie.com/embed/x" data-embed-host="www.youtube-nocookie.com">load</button></p>',
    )
    expect(host.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/x',
    )
    expect(host.querySelector('button[data-embed-url]')).toBeNull()
  })
})
