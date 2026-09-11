import { cursorPayloadSchema, type SortOrder, type Stream } from '../../../shared/schemas.ts'
import type { ItemForDetail, ItemForList } from '../../lib/client-shape.ts'
import { decodeCursorBytes, encodeCursor } from '../../lib/crypto.ts'
import { type IdRef, placeholders } from '../../lib/ids.ts'
import { ftsMatchQuery, parseSearchQuery } from '../../services/search.ts'

const LIST_COLUMNS = `id, feed_id, title, url, author, summary, lead_image_url,
       published_at, is_read, is_starred,
       significant_update_at, starred_at, read_at, public_id`

type ItemListRow = Omit<ItemForList, 'is_read' | 'is_bookmarked' | 'has_update'> & {
  is_read: number
  is_starred: number
  significant_update_at: number | null
  starred_at: number | null
  read_at: number | null
}

type ItemListQuery = {
  stream: Stream
  feedId?: number
  tagId?: number
  q?: string
  order: SortOrder
  limit: number
  cursor?: string
}

type BuiltItemListSql = {
  sql: string
  binds: (string | number)[]
}

const STREAMS: Record<
  Stream,
  { sortColumn: string; predicate: string; index: string; feedIndex?: string }
> = {
  unread: {
    sortColumn: 'published_at',
    predicate: 'is_read = 0',
    index: 'idx_items_unread',
    feedIndex: 'idx_items_feed_unread',
  },
  all: {
    sortColumn: 'published_at',
    predicate: '1 = 1',
    index: 'idx_items_pub',
    feedIndex: 'idx_items_feed_pub',
  },
  bookmarked: {
    sortColumn: 'starred_at',
    predicate: 'is_starred = 1',
    index: 'idx_items_starred',
  },
  recently_read: {
    sortColumn: 'read_at',
    predicate: 'is_read = 1',
    index: 'idx_items_read_at',
  },
  updated: {
    sortColumn: 'significant_update_at',
    predicate: 'significant_update_at IS NOT NULL',
    index: 'idx_items_updated',
  },
}

/** タグで絞るときはフィード用のインデックスが効かないので、ストリーム側のものを使う */
function expectedIndex(
  stream: Stream,
  feedId: number | undefined,
  tagId: number | undefined,
): string {
  const entry = STREAMS[stream]
  if (feedId !== undefined && tagId === undefined) {
    return entry.feedIndex ?? entry.index
  }
  return entry.index
}

function decodeItemCursor(cursor: string): { p: number; i: number } {
  try {
    const parsed = cursorPayloadSchema.safeParse(JSON.parse(decodeCursorBytes(cursor)))
    if (!parsed.success) {
      throw new InvalidCursorError()
    }
    return parsed.data
  } catch {
    throw new InvalidCursorError()
  }
}

export class InvalidCursorError extends Error {
  constructor() {
    super('invalid cursor')
    this.name = 'InvalidCursorError'
  }
}

export function buildItemListSql(query: ItemListQuery): BuiltItemListSql {
  const binds: (string | number)[] = []
  const where: string[] = [STREAMS[query.stream].predicate]
  const col = STREAMS[query.stream].sortColumn
  const search = query.q !== undefined && query.q.length > 0 ? parseSearchQuery(query.q) : null

  const feedId = query.feedId ?? (search?.feedId !== null ? search?.feedId : undefined)
  const tagId = query.tagId
  if (feedId !== undefined) {
    where.push('feed_id = ?')
    binds.push(feedId)
  }
  if (tagId !== undefined) {
    where.push('feed_id IN (SELECT feed_id FROM feed_tags WHERE tag_id = ?)')
    binds.push(tagId)
  }
  if (search?.unread === true) {
    where.push('is_read = 0')
  }
  if (search?.unread === false) {
    where.push('is_read = 1')
  }
  if (search?.bookmarked === true) {
    where.push('is_starred = 1')
  }
  if (search?.tagName) {
    where.push(
      'feed_id IN (SELECT feed_id FROM feed_tags JOIN tags ON tags.id = feed_tags.tag_id WHERE tags.name = ?)',
    )
    binds.push(search.tagName)
  }
  if (search?.after !== null && search?.after !== undefined) {
    where.push('published_at >= ?')
    binds.push(search.after)
  }
  if (search?.before !== null && search?.before !== undefined) {
    where.push('published_at <= ?')
    binds.push(search.before)
  }
  if (search && search.text.length > 0) {
    if ([...search.text].length >= 3) {
      where.push('id IN (SELECT rowid FROM items_fts WHERE items_fts MATCH ?)')
      binds.push(ftsMatchQuery(search.text))
    } else {
      where.push("(title LIKE ? OR IFNULL(summary, '') LIKE ?)")
      const like = `%${search.text}%`
      binds.push(like, like)
    }
  }

  if (query.cursor) {
    const cursor = decodeItemCursor(query.cursor)
    if (query.order === 'asc') {
      where.push(`(${col} > ? OR (${col} = ? AND id > ?))`)
    } else {
      where.push(`(${col} < ? OR (${col} = ? AND id < ?))`)
    }
    binds.push(cursor.p, cursor.p, cursor.i)
  }

  const direction = query.order === 'asc' ? 'ASC' : 'DESC'
  const index = expectedIndex(query.stream, feedId, tagId)
  const indexedBy =
    search !== null && (search.text.length > 0 || search.tagName !== null)
      ? ''
      : ` INDEXED BY ${index}`
  const sql = `SELECT ${LIST_COLUMNS}
FROM items${indexedBy}
WHERE ${where.join(' AND ')}
ORDER BY ${col} ${direction}, id ${direction}
LIMIT ?`
  binds.push(query.limit)
  return { sql, binds }
}

function mapItemListRow(row: ItemListRow): ItemForList {
  return {
    id: row.id,
    feed_id: row.feed_id,
    title: row.title,
    url: row.url,
    author: row.author,
    summary: row.summary,
    lead_image_url: row.lead_image_url,
    published_at: row.published_at,
    is_read: row.is_read === 1,
    is_bookmarked: row.is_starred === 1,
    has_update: row.significant_update_at !== null,
    public_id: row.public_id,
  }
}

export async function listItems(
  db: D1Database,
  query: ItemListQuery,
): Promise<{ items: ItemForList[]; next_cursor: string | null }> {
  const { sql, binds } = buildItemListSql(query)
  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<ItemListRow>()
  const items = result.results.map(mapItemListRow)
  if (items.length < query.limit) {
    return { items, next_cursor: null }
  }
  const last = result.results[items.length - 1]
  if (!last) {
    return { items, next_cursor: null }
  }
  // 並び替えに使った列が空の行もあるので、その場合は公開日時で続きを指す
  const sortValues: Record<string, number | null> = {
    starred_at: last.starred_at,
    read_at: last.read_at,
    significant_update_at: last.significant_update_at,
  }
  const sortValue = sortValues[STREAMS[query.stream].sortColumn] ?? last.published_at
  return { items, next_cursor: encodeCursor({ p: sortValue, i: last.id }) }
}

type ItemDetailRow = Omit<
  ItemForDetail,
  'is_read' | 'is_bookmarked' | 'has_update' | 'has_full_content'
> & {
  is_read: number
  is_starred: number
  significant_update_at: number | null
}

export async function getItem(db: D1Database, ref: IdRef): Promise<ItemForDetail | null> {
  const row = await db
    .prepare(
      `SELECT items.id, items.feed_id, items.title, items.url, items.author, items.summary,
              items.lead_image_url, items.published_at, items.updated_at,
              items.is_read, items.is_starred, items.significant_update_at,
              items.content_html, items.full_content_html, items.original_content_html,
              items.enclosure_url, items.enclosure_mime, items.enclosure_length,
              items.public_id, feeds.language
       FROM items JOIN feeds ON feeds.id = items.feed_id
       WHERE ${ref.kind === 'id' ? 'items.id' : 'items.public_id'} = ?`,
    )
    .bind(ref.kind === 'id' ? ref.id : ref.publicId)
    .first<ItemDetailRow>()
  if (!row) {
    return null
  }
  const { is_read, is_starred, significant_update_at, ...rest } = row
  return {
    ...rest,
    is_read: is_read === 1,
    is_bookmarked: is_starred === 1,
    has_update: significant_update_at !== null,
    has_full_content: row.full_content_html !== null,
  }
}

/**
 * 既読とブックマークはどちらもフラグ列と日時列の対で持つ
 * D1のbindは1文あたり100個までなので、90件ずつに分けて1回のbatchで送る
 */
async function setItemsFlag(
  db: D1Database,
  ids: number[],
  on: boolean,
  now: number,
  column: 'is_read' | 'is_starred',
  atColumn: 'read_at' | 'starred_at',
): Promise<void> {
  if (ids.length === 0) {
    return
  }
  const statements: D1PreparedStatement[] = []
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90)
    const marks = placeholders(chunk.length)
    statements.push(
      on
        ? db
            .prepare(
              `UPDATE items SET ${column} = 1, ${atColumn} = ? WHERE id IN (${marks}) AND ${column} = 0`,
            )
            .bind(now, ...chunk)
        : db
            .prepare(
              `UPDATE items SET ${column} = 0, ${atColumn} = NULL WHERE id IN (${marks}) AND ${column} = 1`,
            )
            .bind(...chunk),
    )
  }
  await db.batch(statements)
}

export async function setItemsRead(
  db: D1Database,
  ids: number[],
  read: boolean,
  now: number,
): Promise<void> {
  await setItemsFlag(db, ids, read, now, 'is_read', 'read_at')
}

export async function setItemsBookmarked(
  db: D1Database,
  ids: number[],
  bookmarked: boolean,
  now: number,
): Promise<void> {
  await setItemsFlag(db, ids, bookmarked, now, 'is_starred', 'starred_at')
}

export async function markStreamRead(
  db: D1Database,
  opts: { stream: Stream; before: number; feedId?: number; tagId?: number; now: number },
): Promise<void> {
  const where = ['is_read = 0', 'published_at <= ?']
  const binds: (string | number)[] = [opts.before]
  if (opts.stream === 'bookmarked') {
    where.push('is_starred = 1')
  } else if (opts.stream === 'updated') {
    where.push('significant_update_at IS NOT NULL')
  }
  if (opts.feedId !== undefined) {
    where.push('feed_id = ?')
    binds.push(opts.feedId)
  }
  if (opts.tagId !== undefined) {
    where.push('feed_id IN (SELECT feed_id FROM feed_tags WHERE tag_id = ?)')
    binds.push(opts.tagId)
  }
  await db
    .prepare(`UPDATE items SET is_read = 1, read_at = ? WHERE ${where.join(' AND ')}`)
    .bind(opts.now, ...binds)
    .run()
}
