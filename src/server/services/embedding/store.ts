import { type ItemListRow, LIST_COLUMNS, mapItemListRow } from '../../db/queries/items.ts'
import type { ItemForList } from '../../lib/client-shape.ts'
import type { EmbeddingSource } from './text.ts'

export type PendingItem = EmbeddingSource & { id: number; source_key: string }

// 埋め込みの入力が変わった事を表す。全文の取得と削除は`content_hash`を変えないので、取得した時刻も合わせる
const SOURCE_KEY = `items.content_hash || ':' || COALESCE(items.full_content_fetched_at, '')`

/**
 * 埋め込みが無い記事、本文が変わった記事、別のモデルで埋め込んだ記事を新しい順に返す
 * 埋め込めなかった記事（`model`がNULL）は、本文が変わるか、記録が`retryBefore`より古くなるまで返さない
 */
export async function listPendingItems(
  db: D1Database,
  model: string,
  retryBefore: number,
  limit: number,
): Promise<PendingItem[]> {
  const rows = await db
    .prepare(
      `SELECT items.id, items.title, items.content_html, items.full_content_html,
       ${SOURCE_KEY} AS source_key
FROM items LEFT JOIN item_embeddings e ON e.item_id = items.id
WHERE e.item_id IS NULL
   OR e.source_key <> ${SOURCE_KEY}
   OR (e.model IS NOT NULL AND e.model <> ?)
   OR (e.model IS NULL AND e.embedded_at < ?)
ORDER BY items.id DESC
LIMIT ?`,
    )
    .bind(model, retryBefore, limit)
    .all<PendingItem>()
  return rows.results
}

export type EmbeddingRecord = { itemId: number; model: string | null; sourceKey: string }

/**
 * 台帳に記録する。記録までの間に消えた記事は台帳に入れず、ベクトルを入れた分は削除の控えに回す
 * 埋め込み直した記事に古い控えが残っていると新しいベクトルを消してしまうので、控えも消す
 */
export function recordEmbeddingsStatements(
  db: D1Database,
  records: readonly EmbeddingRecord[],
  now: number,
): D1PreparedStatement[] {
  return records.flatMap((record) => {
    const statements = [
      db
        .prepare(
          `INSERT INTO item_embeddings (item_id, model, source_key, embedded_at)
SELECT id, ?, ?, ? FROM items WHERE id = ?
ON CONFLICT (item_id) DO UPDATE SET
  model = excluded.model, source_key = excluded.source_key, embedded_at = excluded.embedded_at`,
        )
        .bind(record.model, record.sourceKey, now, record.itemId),
    ]
    if (record.model !== null) {
      statements.push(
        db
          .prepare(
            `DELETE FROM embedding_deletions
WHERE item_id = ? AND EXISTS (SELECT 1 FROM items WHERE id = ?)`,
          )
          .bind(record.itemId, record.itemId),
        db
          .prepare(
            `INSERT OR IGNORE INTO embedding_deletions (item_id)
SELECT ? WHERE NOT EXISTS (SELECT 1 FROM items WHERE id = ?)`,
          )
          .bind(record.itemId, record.itemId),
      )
    }
    return statements
  })
}

export async function listDeletions(db: D1Database, limit: number): Promise<number[]> {
  const rows = await db
    .prepare('SELECT item_id FROM embedding_deletions ORDER BY item_id LIMIT ?')
    .bind(limit)
    .all<{ item_id: number }>()
  return rows.results.map((row) => row.item_id)
}

export async function clearDeletions(db: D1Database, itemIds: readonly number[]): Promise<void> {
  await db
    .prepare('DELETE FROM embedding_deletions WHERE item_id IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify(itemIds))
    .run()
}

export async function hasEmbedding(
  db: D1Database,
  itemId: number,
  model: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS found FROM item_embeddings WHERE item_id = ? AND model = ?')
    .bind(itemId, model)
    .first<{ found: number }>()
  return row !== null
}

export async function getListItems(
  db: D1Database,
  itemIds: readonly number[],
): Promise<Map<number, ItemForList>> {
  const rows = await db
    .prepare(`SELECT ${LIST_COLUMNS} FROM items WHERE id IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(itemIds))
    .all<ItemListRow>()
  return new Map(rows.results.map((row) => [row.id, mapItemListRow(row)]))
}
