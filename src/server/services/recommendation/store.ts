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
