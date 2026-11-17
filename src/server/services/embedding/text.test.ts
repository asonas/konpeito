import { describe, expect, it } from 'vitest'
import { EMBEDDING_BODY_CHARS, embeddingText } from './text.ts'

describe('embeddingText', () => {
  it('prefers the full content over the feed content', () => {
    expect(
      embeddingText({
        title: 'Title',
        content_html: '<p>from the feed</p>',
        full_content_html: '<p>full <b>article</b></p>',
      }),
    ).toBe('title: Title | text: full article')
  })

  it('clips the body without leaving half of a surrogate pair', () => {
    const body = `${'a'.repeat(EMBEDDING_BODY_CHARS - 1)}😀tail`
    const text = embeddingText({ title: '', content_html: body, full_content_html: null })
    expect(text).toBe(`title: none | text: ${'a'.repeat(EMBEDDING_BODY_CHARS - 1)}`)
  })

  it('returns null when there is nothing to embed', () => {
    expect(embeddingText({ title: ' ', content_html: '<p> </p>', full_content_html: null })).toBe(
      null,
    )
  })
})
