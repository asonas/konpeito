const DAY = 24 * 60 * 60

export type ReadingCounts = {
  /** おすすめの一覧に、この期間に初めて表示された記事の数。表示の記録は記事ごとに最初の1件だけ残る */
  impressions: number
  /** 開いた記事の数。同じ記事を何度開いても1と数える */
  opens: number
  dwell_ms: number
  original_opens: number
  link_clicks: number
  likes: number
  dislikes: number
}

export type FeedReadingStats = ReadingCounts & {
  feed_id: number
  title: string
  custom_title: string | null
}

type ActivityRow = Omit<FeedReadingStats, 'likes' | 'dislikes'>
type FeedbackRow = { feed_id: number; likes: number; dislikes: number }

const EMPTY: ReadingCounts = {
  impressions: 0,
  opens: 0,
  dwell_ms: 0,
  original_opens: 0,
  link_clicks: 0,
  likes: 0,
  dislikes: 0,
}

/**
 * 直近`days`日のイベントをフィード別に集計する。閲覧時間の長い順に返す
 * 記事を消すとそのイベントも消えるので、消した記事の分は過去の期間からも減る
 */
export async function loadReadingStats(
  db: D1Database,
  days: number,
  now: number,
): Promise<{ totals: ReadingCounts; feeds: FeedReadingStats[] }> {
  const since = now - days * DAY
  const [activity, feedback] = await db.batch([
    db
      .prepare(
        `SELECT items.feed_id, feeds.title, feeds.custom_title,
       COUNT(DISTINCT CASE WHEN e.kind = 'impression' THEN e.item_id END) AS impressions,
       COUNT(DISTINCT CASE WHEN e.kind = 'open' THEN e.item_id END) AS opens,
       COALESCE(SUM(CASE WHEN e.kind = 'close' THEN e.dwell_ms END), 0) AS dwell_ms,
       COALESCE(SUM(e.kind = 'open_original'), 0) AS original_opens,
       COALESCE(SUM(e.kind = 'link_click'), 0) AS link_clicks
FROM item_events e
JOIN items ON items.id = e.item_id
JOIN feeds ON feeds.id = items.feed_id
WHERE e.created_at >= ?
GROUP BY items.feed_id
ORDER BY dwell_ms DESC, opens DESC, items.feed_id`,
      )
      .bind(since),
    // 評価は取り消しや付け直しができるので、記事ごとに期間内の最後の1件だけを数える
    db
      .prepare(
        `SELECT feed_id,
       COALESCE(SUM(kind = 'like'), 0) AS likes,
       COALESCE(SUM(kind = 'dislike'), 0) AS dislikes
FROM (
  SELECT items.feed_id, e.kind,
         ROW_NUMBER() OVER (PARTITION BY e.item_id ORDER BY e.created_at DESC, e.id DESC) AS rn
  FROM item_events e
  JOIN items ON items.id = e.item_id
  WHERE e.created_at >= ? AND e.kind IN ('like', 'dislike', 'clear_feedback')
)
WHERE rn = 1
GROUP BY feed_id`,
      )
      .bind(since),
  ])
  const feedbackByFeed = new Map(
    ((feedback?.results ?? []) as FeedbackRow[]).map((row) => [row.feed_id, row]),
  )
  const feeds = ((activity?.results ?? []) as ActivityRow[]).map((row) => ({
    ...row,
    likes: feedbackByFeed.get(row.feed_id)?.likes ?? 0,
    dislikes: feedbackByFeed.get(row.feed_id)?.dislikes ?? 0,
  }))
  const totals = { ...EMPTY }
  for (const feed of feeds) {
    for (const key of Object.keys(EMPTY) as (keyof ReadingCounts)[]) {
      totals[key] += feed[key]
    }
  }
  return { totals, feeds }
}
