import type { ITEM_EVENT_KINDS } from '../../../shared/schemas.ts'
import { type ItemListRow, LIST_COLUMNS, mapItemListRow } from '../../db/queries/items.ts'
import type { ItemForList } from '../../lib/client-shape.ts'
import type { JevItem } from './jev.ts'

export type PreferenceVersionRow = {
  id: number
  body: string
  source: 'manual' | 'llm'
  parent_id: number | null
  status: 'active' | 'candidate' | 'rejected' | 'retired'
  eval_json: string | null
  rationale: string | null
  created_at: number
  activated_at: number | null
}

export type ScorableItem = JevItem & { id: number }

type ItemEventKind = (typeof ITEM_EVENT_KINDS)[number]

const PREFERENCE_COLUMNS =
  'id, body, source, parent_id, status, eval_json, rationale, created_at, activated_at'

export function getActiveVersion(db: D1Database): Promise<PreferenceVersionRow | null> {
  return db
    .prepare(`SELECT ${PREFERENCE_COLUMNS} FROM preference_versions WHERE status = 'active'`)
    .first<PreferenceVersionRow>()
}

export async function listVersions(db: D1Database, limit: number): Promise<PreferenceVersionRow[]> {
  const rows = await db
    .prepare(`SELECT ${PREFERENCE_COLUMNS} FROM preference_versions ORDER BY id DESC LIMIT ?`)
    .bind(limit)
    .all<PreferenceVersionRow>()
  return rows.results
}

const SCORABLE_COLUMNS = `items.id AS id, items.title AS title, IFNULL(items.summary, '') AS summary,
       CASE WHEN feeds.custom_title IS NOT NULL AND feeds.custom_title <> ''
            THEN feeds.custom_title ELSE feeds.title END AS feed`

/** 未読の新着のうち、その版でまだ採点していない記事 */
export async function listUnscoredItems(
  db: D1Database,
  versionId: number,
  since: number,
  limit: number,
): Promise<ScorableItem[]> {
  const rows = await db
    .prepare(
      `SELECT ${SCORABLE_COLUMNS}
FROM items JOIN feeds ON feeds.id = items.feed_id
WHERE items.is_read = 0 AND items.published_at >= ?
  AND NOT EXISTS (SELECT 1 FROM item_scores s WHERE s.item_id = items.id AND s.version_id = ?)
ORDER BY items.published_at DESC, items.id DESC
LIMIT ?`,
    )
    .bind(since, versionId, limit)
    .all<ScorableItem>()
  return rows.results
}

export async function getScorableItems(
  db: D1Database,
  ids: readonly number[],
): Promise<ScorableItem[]> {
  if (ids.length === 0) {
    return []
  }
  const rows = await db
    .prepare(
      `SELECT ${SCORABLE_COLUMNS}
FROM items JOIN feeds ON feeds.id = items.feed_id
WHERE items.id IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(ids))
    .all<ScorableItem>()
  return rows.results
}

export async function getScores(
  db: D1Database,
  versionId: number,
  ids: readonly number[],
): Promise<Map<number, number>> {
  if (ids.length === 0) {
    return new Map()
  }
  const rows = await db
    .prepare(
      `SELECT item_id, score FROM item_scores
WHERE version_id = ? AND item_id IN (SELECT value FROM json_each(?))`,
    )
    .bind(versionId, JSON.stringify(ids))
    .all<{ item_id: number; score: number }>()
  return new Map(rows.results.map((row) => [row.item_id, row.score]))
}

export function saveScoresStatements(
  db: D1Database,
  versionId: number,
  scores: ReadonlyMap<number, number>,
  now: number,
): D1PreparedStatement[] {
  const statement = db.prepare(
    'INSERT OR REPLACE INTO item_scores (item_id, version_id, score, scored_at) VALUES (?, ?, ?, ?)',
  )
  return [...scores].map(([itemId, score]) => statement.bind(itemId, versionId, score, now))
}

export type RecommendedItem = ItemForList & { score: number; explore: boolean }

/** 何件ごとに探索枠を1件差し込むか */
export const EXPLORE_EVERY = 5

/**
 * スコア上位だけを出すと、上位の記事への反応しか集まらず評価が偏る
 * そこで`every`件ごとに1件、上位に入らなかった記事を差し込む
 */
export function interleaveExploration<T>(
  top: readonly T[],
  explore: readonly T[],
  every: number,
): T[] {
  const result: T[] = []
  let t = 0
  let e = 0
  while (t < top.length || e < explore.length) {
    const takeExplore = (result.length + 1) % every === 0 && e < explore.length
    if (takeExplore || t >= top.length) {
      const next = explore[e]
      e += 1
      if (next !== undefined) {
        result.push(next)
      }
    } else {
      const next = top[t]
      t += 1
      if (next !== undefined) {
        result.push(next)
      }
    }
  }
  return result
}

type ScoredRow = ItemListRow & { score: number }

export async function listRecommendations(
  db: D1Database,
  versionId: number,
  limit: number,
): Promise<RecommendedItem[]> {
  const exploreCount = Math.floor(limit / EXPLORE_EVERY)
  const topRows = await db
    .prepare(
      `SELECT ${LIST_COLUMNS}, s.score AS score
FROM items JOIN item_scores s ON s.item_id = items.id AND s.version_id = ?
WHERE items.is_read = 0
ORDER BY s.score DESC, items.id DESC
LIMIT ?`,
    )
    .bind(versionId, limit - exploreCount)
    .all<ScoredRow>()
  const topIds = topRows.results.map((row) => row.id)
  const exploreRows =
    exploreCount === 0
      ? { results: [] as ScoredRow[] }
      : await db
          .prepare(
            `SELECT ${LIST_COLUMNS}, s.score AS score
FROM items JOIN item_scores s ON s.item_id = items.id AND s.version_id = ?
WHERE items.is_read = 0 AND items.id NOT IN (SELECT value FROM json_each(?))
ORDER BY RANDOM()
LIMIT ?`,
          )
          .bind(versionId, JSON.stringify(topIds), exploreCount)
          .all<ScoredRow>()
  const shape = (explore: boolean) => (row: ScoredRow) => ({
    ...mapItemListRow(row),
    score: row.score,
    explore,
  })
  return interleaveExploration(
    topRows.results.map(shape(false)),
    exploreRows.results.map(shape(true)),
    EXPLORE_EVERY,
  )
}

/** 同じ記事の表示を何度も数えないよう、最初の表示だけを残す */
export function recordImpressionsStatements(
  db: D1Database,
  versionId: number,
  items: readonly RecommendedItem[],
  now: number,
): D1PreparedStatement[] {
  const statement = db.prepare(
    `INSERT INTO item_events (item_id, kind, version_id, score, created_at)
SELECT ?, 'impression', ?, ?, ?
WHERE NOT EXISTS (SELECT 1 FROM item_events WHERE item_id = ? AND kind = 'impression')`,
  )
  return items.map((item) => statement.bind(item.id, versionId, item.score, now, item.id))
}

/** 記事が無ければ何も書かずに`false`を返す */
export async function insertItemEvent(
  db: D1Database,
  event: { itemId: number; kind: ItemEventKind; dwellMs: number | null; now: number },
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO item_events (item_id, kind, dwell_ms, created_at)
SELECT id, ?, ?, ? FROM items WHERE id = ?`,
    )
    .bind(event.kind, event.dwellMs, event.now, event.itemId)
    .run()
  return result.meta.changes > 0
}

export type Feedback = 'like' | 'dislike' | null

export async function getFeedback(db: D1Database, itemId: number): Promise<Feedback> {
  const row = await db
    .prepare(
      `SELECT kind FROM item_events
WHERE item_id = ? AND kind IN ('like', 'dislike', 'clear_feedback')
ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(itemId)
    .first<{ kind: string }>()
  return row?.kind === 'like' || row?.kind === 'dislike' ? row.kind : null
}
