import { describe, expect, it } from 'vitest'
import { legacyUrlRedirect, queryFilterRedirect } from './legacy-url.ts'
import type { Feed, Tag } from './queries.ts'

function feed(id: number, publicId: string | null): Feed {
  return { id, public_id: publicId } as Feed
}

function tag(id: number, publicId: string | null): Tag {
  return { id, public_id: publicId } as Tag
}

const feeds = [feed(1, 'feedaaaa')]
const tags = [tag(2, 'tagaaaa')]

describe('legacyUrlRedirect', () => {
  it('公開IDだけのURLは何もしない', () => {
    expect(
      legacyUrlRedirect({
        feedRef: 'feedaaaa',
        tagRef: undefined,
        itemRef: 'itemaaaaaa',
        onSearch: false,
        search: {},
        feeds,
        tags,
        itemPublicId: undefined,
      }),
    ).toEqual({ kind: 'none' })
  })

  it('数値のフィードIDを公開IDに置き換える', () => {
    expect(
      legacyUrlRedirect({
        feedRef: '1',
        tagRef: undefined,
        itemRef: undefined,
        onSearch: false,
        search: { filter: 'starred' },
        feeds,
        tags,
        itemPublicId: undefined,
      }),
    ).toEqual({
      kind: 'redirect',
      href: { to: '/feeds/$feedId', params: { feedId: 'feedaaaa' }, search: {} },
    })
  })

  it('数値の記事IDと filter=unread を未読の公開IDへ一度に移す', () => {
    expect(
      legacyUrlRedirect({
        feedRef: undefined,
        tagRef: undefined,
        itemRef: '30',
        onSearch: false,
        search: { filter: 'unread' },
        feeds,
        tags,
        itemPublicId: 'itemaaaaaa',
      }),
    ).toEqual({
      kind: 'redirect',
      href: {
        to: '/unread/items/$itemId',
        params: { itemId: 'itemaaaaaa' },
        search: {},
      },
    })
  })

  it('数値の記事IDは公開IDが届くまで待つ', () => {
    const base = {
      feedRef: undefined,
      tagRef: '2',
      itemRef: '30',
      onSearch: false,
      search: {},
      feeds,
      tags,
    }
    expect(legacyUrlRedirect({ ...base, itemPublicId: undefined })).toEqual({ kind: 'waiting' })
    expect(legacyUrlRedirect({ ...base, itemPublicId: 'itemaaaaaa' })).toEqual({
      kind: 'redirect',
      href: {
        to: '/tags/$tagId/items/$itemId',
        params: { tagId: 'tagaaaa', itemId: 'itemaaaaaa' },
        search: {},
      },
    })
  })

  it('検索中の数値の記事IDは検索の文脈を保つ', () => {
    expect(
      legacyUrlRedirect({
        feedRef: undefined,
        tagRef: undefined,
        itemRef: '30',
        onSearch: true,
        search: { q: 'hello' },
        feeds,
        tags,
        itemPublicId: 'itemaaaaaa',
      }),
    ).toEqual({
      kind: 'redirect',
      href: {
        to: '/search/items/$itemId',
        params: { itemId: 'itemaaaaaa' },
        search: { q: 'hello' },
      },
    })
  })

  it('filter=unread と filter=starred をパスへ移す', () => {
    const base = {
      feedRef: undefined,
      tagRef: undefined,
      itemRef: undefined,
      onSearch: false,
      feeds,
      tags,
      itemPublicId: undefined,
    }
    expect(queryFilterRedirect({ ...base, search: { filter: 'unread' } })).toEqual({
      kind: 'redirect',
      href: { to: '/unread', search: {} },
    })
    expect(queryFilterRedirect({ ...base, search: { filter: 'starred' } })).toEqual({
      kind: 'redirect',
      href: { to: '/bookmarks', search: {} },
    })
    expect(
      queryFilterRedirect({
        ...base,
        itemRef: 'itemaaaaaa',
        search: { filter: 'unread' },
      }),
    ).toEqual({
      kind: 'redirect',
      href: { to: '/unread/items/$itemId', params: { itemId: 'itemaaaaaa' }, search: {} },
    })
  })

  it('フィードやタグに付いた未読・ブックマークのクエリは外す', () => {
    expect(
      queryFilterRedirect({
        feedRef: 'feedaaaa',
        tagRef: undefined,
        itemRef: undefined,
        onSearch: false,
        search: { filter: 'unread' },
        feeds,
        tags,
        itemPublicId: undefined,
      }),
    ).toEqual({
      kind: 'redirect',
      href: { to: '/feeds/$feedId', params: { feedId: 'feedaaaa' }, search: {} },
    })
  })

  it('フィードが見つからなければ置き換えない', () => {
    expect(
      legacyUrlRedirect({
        feedRef: '99',
        tagRef: undefined,
        itemRef: undefined,
        onSearch: false,
        search: {},
        feeds,
        tags,
        itemPublicId: undefined,
      }),
    ).toEqual({ kind: 'none' })
  })
})
