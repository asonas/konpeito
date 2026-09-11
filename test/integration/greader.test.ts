import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { sha256Hex } from '../../src/server/lib/crypto.ts'
import { parseItemId } from '../../src/server/routes/greader/ids.ts'
import { ORIGIN } from '../helpers.ts'

async function authHeader(): Promise<string> {
  const secret = 'testapppasswordsecretvalue0001'
  const hash = sha256Hex(secret)
  await env.DB.prepare(
    'INSERT OR IGNORE INTO api_tokens (name, secret_hash, created_at) VALUES (?, ?, ?)',
  )
    .bind('test', hash, 1)
    .run()
  return `GoogleLogin auth=user/${secret}`
}

async function seedFeed(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO feeds (id, feed_url, site_url, title, custom_title, next_fetch_at, created_at)
     VALUES (123, ?, ?, ?, ?, 0, 1)`,
  )
    .bind('https://example.com/feed.xml', 'https://example.com/', 'Example Feed', 'Custom')
    .run()
  await env.DB.prepare(
    `INSERT INTO items (id, feed_id, guid_hash, title, url, author, summary, content_html,
                        published_at, crawled_at, content_hash, is_read, is_starred)
     VALUES (31, 123, ?, ?, ?, ?, ?, ?, 1756857600, 1756857600, ?, 0, 0)`,
  )
    .bind('g1', 'Hello', 'https://example.com/post', 'Ada', 'summary', '<p>body</p>', 'hash')
    .run()
  await env.DB.prepare('INSERT INTO tags (id, name, created_at) VALUES (1, ?, 1)')
    .bind('Blog')
    .run()
  await env.DB.prepare('INSERT INTO feed_tags (feed_id, tag_id) VALUES (123, 1)').run()
}

describe('Google Reader API', () => {
  it('parses the three item id formats to the same id', () => {
    expect(parseItemId('tag:google.com,2005:reader/item/000000000000001F')).toBe(31)
    expect(parseItemId('000000000000001F')).toBe(31)
    expect(parseItemId('31')).toBe(31)
  })

  it('returns ClientLogin, user-info, subscription list, unread-count, and stream shapes', async () => {
    const authorization = await authHeader()
    await seedFeed()
    const secret = 'testapppasswordsecretvalue0001'

    const login = await SELF.fetch(`${ORIGIN}/accounts/ClientLogin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `Email=user&Passwd=${secret}`,
    })
    expect(login.status).toBe(200)
    expect(login.headers.get('Content-Type')).toContain('text/plain')
    const loginText = await login.text()
    expect(loginText).toContain(`Auth=${secret}`)

    const headers = { authorization }
    const userInfo = await SELF.fetch(`${ORIGIN}/reader/api/0/user-info`, { headers })
    expect(await userInfo.json()).toEqual({
      userId: '1',
      userName: 'user',
      userProfileId: '1',
      userEmail: `user@${new URL(ORIGIN).hostname}`,
    })

    const subs = await SELF.fetch(`${ORIGIN}/reader/api/0/subscription/list`, { headers })
    const subBody = z
      .object({
        subscriptions: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            url: z.string(),
            htmlUrl: z.string(),
            iconUrl: z.string(),
            categories: z.array(z.object({ id: z.string(), label: z.string() })),
          }),
        ),
      })
      .parse(await subs.json())

    const unread = await SELF.fetch(`${ORIGIN}/reader/api/0/unread-count`, { headers })
    const unreadBody = await unread.json()

    const contents = await SELF.fetch(
      `${ORIGIN}/reader/api/0/stream/contents/user/-/state/com.google/reading-list`,
      { headers },
    )
    const contentsJson: unknown = await contents.json()
    const contentsBody =
      typeof contentsJson === 'object' && contentsJson !== null
        ? { ...contentsJson, updated: 0 }
        : contentsJson

    const ids = await SELF.fetch(
      `${ORIGIN}/reader/api/0/stream/items/ids?s=user/-/state/com.google/reading-list`,
      {
        headers,
      },
    )
    const idsBody = await ids.json()

    const edit = await SELF.fetch(`${ORIGIN}/reader/api/0/edit-tag`, {
      method: 'POST',
      headers: {
        authorization,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'i=31&a=user/-/state/com.google/read',
    })
    expect(edit.status).toBe(200)
    expect(edit.headers.get('Content-Type')).toContain('text/plain')
    expect(await edit.text()).toBe('OK')

    const mark = await SELF.fetch(`${ORIGIN}/reader/api/0/mark-all-as-read`, {
      method: 'POST',
      headers: {
        authorization,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 's=user/-/state/com.google/reading-list&ts=1756857600000000',
    })
    expect(mark.status).toBe(200)
    expect(mark.headers.get('Content-Type')).toContain('text/plain')
    expect(await mark.text()).toBe('OK')

    const alias = await SELF.fetch(`${ORIGIN}/greader/api/0/token`, { headers })
    expect(await alias.text()).toBe('reader-token')

    const token = await SELF.fetch(`${ORIGIN}/reader/api/0/token`, { headers })
    expect(await token.text()).toBe('reader-token')

    const tags = await SELF.fetch(`${ORIGIN}/reader/api/0/tag/list`, { headers })
    expect(await tags.json()).toEqual({
      tags: [
        { id: 'user/-/state/com.google/starred' },
        { id: 'user/-/label/Blog', type: 'folder' },
      ],
    })

    const stableSubs = {
      ...subBody,
      subscriptions: subBody.subscriptions.map((sub) => ({ ...sub, iconUrl: '[signed]' })),
    }
    expect(stableSubs).toMatchSnapshot('subscription-list')
    expect(unreadBody).toMatchSnapshot('unread-count')
    expect(contentsBody).toMatchSnapshot('stream-contents')
    expect(idsBody).toMatchSnapshot('stream-ids')
  })

  it('absolutizes image proxy urls in stream contents', async () => {
    const authorization = await authHeader()
    await env.DB.prepare(
      `INSERT INTO feeds (id, feed_url, title, next_fetch_at, created_at)
       VALUES (124, ?, 'Images', 0, 1)`,
    )
      .bind('https://example.com/images.xml')
      .run()
    await env.DB.prepare(
      `INSERT INTO items (id, feed_id, guid_hash, title, url, summary, content_html,
                          published_at, crawled_at, content_hash, is_read, is_starred)
       VALUES (32, 124, ?, ?, ?, ?, ?, 1756857600, 1756857600, ?, 0, 0)`,
    )
      .bind(
        'g2',
        'Photo',
        'https://example.com/photo',
        'summary',
        '<p><img src="/img?u=abc&s=def" srcset="/img?u=abc&s=def 1x, /img?u=ghi&s=jkl 2x"></p>',
        'hash2',
      )
      .run()

    const contents = await SELF.fetch(`${ORIGIN}/reader/api/0/stream/contents/feed/124`, {
      headers: { authorization },
    })
    const contentsBody = z
      .object({
        items: z.array(z.object({ summary: z.object({ content: z.string() }) })),
      })
      .parse(await contents.json())
    const html = contentsBody.items[0]?.summary.content ?? ''
    expect(html).toContain(`${ORIGIN}/img?u=abc&s=def`)
    expect(html).not.toContain('src="/img?')
  })
})
