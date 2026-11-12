import type { ITEM_EVENT_KINDS } from '../../../shared/schemas.ts'
import { type ItemListRow, LIST_COLUMNS, mapItemListRow } from '../../db/queries/items.ts'
import type { ItemForList } from '../../lib/client-shape.ts'
import type { JevItem } from './jev.ts'
import type { EventRow, StarRow } from './labels.ts'

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

/**
 * 記事が画面に表示された事を記録する。表示した時点の有効な版とその版のスコアを添える
 * 同じ記事の表示を何度も数えないよう、最初の表示だけを残す
 */
export async function insertImpression(db: D1Database, itemId: number, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO item_events (item_id, kind, version_id, score, created_at)
SELECT items.id, 'impression', v.id, s.score, ?
FROM items
LEFT JOIN preference_versions v ON v.status = 'active'
LEFT JOIN item_scores s ON s.item_id = items.id AND s.version_id = v.id
WHERE items.id = ?
  AND NOT EXISTS (SELECT 1 FROM item_events WHERE item_id = items.id AND kind = 'impression')`,
    )
    .bind(now, itemId)
    .run()
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

/** `deriveLabels`は同じ時刻の明示的な評価を渡された順で解くので、時刻とidで並べる */
export async function loadLabelSources(
  db: D1Database,
  since: number,
): Promise<{ events: EventRow[]; stars: StarRow[] }> {
  const [events, stars] = await db.batch([
    db
      .prepare(
        `SELECT item_id, kind, dwell_ms, created_at FROM item_events
WHERE created_at >= ? ORDER BY created_at, id`,
      )
      .bind(since),
    db
      .prepare('SELECT id, starred_at FROM items WHERE is_starred = 1 AND starred_at >= ?')
      .bind(since),
  ])
  return {
    events: (events?.results ?? []) as EventRow[],
    stars: (stars?.results ?? []) as StarRow[],
  }
}

/**
 * 最後に嗜好が確定した時刻。手書きの保存と、評価を終えた候補を数える
 * APIの失敗で評価できなかった候補は数えず、次の実行で同じラベルから学習し直せるようにする
 */
export async function lastLearningAt(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      `SELECT MAX(created_at) AS at FROM preference_versions
WHERE source = 'manual'
   OR (eval_json IS NOT NULL AND json_extract(eval_json, '$.error') IS NULL)`,
    )
    .first<{ at: number | null }>()
  return row?.at ?? 0
}

export async function insertCandidate(
  db: D1Database,
  candidate: { body: string; rationale: string; parentId: number; now: number },
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO preference_versions (body, source, parent_id, status, rationale, created_at)
VALUES (?, 'llm', ?, 'candidate', ?, ?) RETURNING id`,
    )
    .bind(candidate.body, candidate.parentId, candidate.rationale, candidate.now)
    .first<{ id: number }>()
  if (!row) {
    throw new Error('Failed to insert a candidate preference')
  }
  return row.id
}

/**
 * 候補は`comparedWith`に勝っただけなので、評価の間に別の版が有効になっていたら切り替えずに却下する
 * 有効な版は1件だけなので、候補を有効にする前に比較元を退かせる
 */
export function activateStatements(
  db: D1Database,
  versionId: number,
  comparedWith: number,
  evaluation: Record<string, unknown>,
  now: number,
): D1PreparedStatement[] {
  const evalJson = JSON.stringify(evaluation)
  return [
    db
      .prepare(
        "UPDATE preference_versions SET status = 'retired' WHERE id = ? AND status = 'active'",
      )
      .bind(comparedWith),
    db
      .prepare(
        `UPDATE preference_versions SET status = 'active', activated_at = ?, eval_json = ?
WHERE id = ? AND NOT EXISTS (SELECT 1 FROM preference_versions WHERE status = 'active')`,
      )
      .bind(now, evalJson, versionId),
    db
      .prepare(
        "UPDATE preference_versions SET status = 'rejected', eval_json = ? WHERE id = ? AND status = 'candidate'",
      )
      .bind(JSON.stringify({ ...evaluation, superseded: true }), versionId),
  ]
}

export function rejectStatement(
  db: D1Database,
  versionId: number,
  evalJson: string,
): D1PreparedStatement {
  return db
    .prepare("UPDATE preference_versions SET status = 'rejected', eval_json = ? WHERE id = ?")
    .bind(evalJson, versionId)
}

export async function createManualVersion(
  db: D1Database,
  body: string,
  now: number,
): Promise<number> {
  const active = await getActiveVersion(db)
  const [, inserted] = await db.batch([
    db.prepare("UPDATE preference_versions SET status = 'retired' WHERE status = 'active'"),
    db
      .prepare(
        `INSERT INTO preference_versions (body, source, parent_id, status, created_at, activated_at)
VALUES (?, 'manual', ?, 'active', ?, ?) RETURNING id`,
      )
      .bind(body, active?.id ?? null, now, now),
  ])
  const id = (inserted?.results[0] as { id: number } | undefined)?.id
  if (id === undefined) {
    throw new Error('Failed to insert a preference')
  }
  return id
}
