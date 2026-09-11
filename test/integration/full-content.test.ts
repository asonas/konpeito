import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { extractFullContent, saveFullContent } from '../../src/server/services/extractor.ts'

describe('full content extraction', () => {
  it('leaves full_content_html unchanged on failure and sanitizes on success', async () => {
    const feed = await env.DB.prepare(
      'INSERT INTO feeds (feed_url, site_url, title, next_fetch_at, created_at) VALUES (?, ?, ?, 1, 1)',
    )
      .bind('https://example.com/full.xml', 'https://example.com/', 'Full')
      .run()
    const feedId = feed.meta.last_row_id
    const item = await env.DB.prepare(
      `INSERT INTO items (feed_id, guid_hash, title, url, content_html, full_content_html,
                          published_at, crawled_at, content_hash)
       VALUES (?, 'f1', '記事', ?, '<p>抜粋</p>', '<p>既存の全文</p>', 1, 1, 'h')`,
    )
      .bind(feedId, 'https://example.com/article')
      .run()
    const itemId = item.meta.last_row_id
    const original = globalThis.fetch
    try {
      globalThis.fetch = async () => new Response('no article here', { status: 200 })
      const failed = await extractFullContent(env, itemId, true)
      expect(failed).toEqual({ kind: 'failed', reason: 'not_html' })
      const afterFail = await env.DB.prepare('SELECT full_content_html FROM items WHERE id = ?')
        .bind(itemId)
        .first<{ full_content_html: string | null }>()
      expect(afterFail?.full_content_html).toBe('<p>既存の全文</p>')

      globalThis.fetch = async () =>
        new Response(
          '<html><body><article><h1>本編</h1><p>十分な長さの本文です。<script>alert(1)</script></p></article></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html' } },
        )
      const ok = await extractFullContent(env, itemId, true)
      expect(ok.kind).toBe('ok')
      if (ok.kind !== 'ok') {
        throw new Error('expected ok')
      }
      expect(ok.html).not.toContain('script')
      expect(ok.html).toContain('本編')
      await saveFullContent(env, itemId, ok.html)
      const afterOk = await env.DB.prepare('SELECT full_content_html FROM items WHERE id = ?')
        .bind(itemId)
        .first<{ full_content_html: string | null }>()
      expect(afterOk?.full_content_html).toBe(ok.html)
    } finally {
      globalThis.fetch = original
    }
  })
})
