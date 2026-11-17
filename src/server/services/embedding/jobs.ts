import type { ItemForList } from '../../lib/client-shape.ts'
import { EMBEDDING_MODEL, type EmbeddingDeps } from './deps.ts'
import {
  clearDeletions,
  type EmbeddingRecord,
  getListItems,
  hasEmbedding,
  listDeletions,
  listPendingItems,
  type PendingItem,
  recordEmbeddingsStatements,
} from './store.ts'
import { embeddingText } from './text.ts'

const EMBED_LIMIT_PER_RUN = 100
const EMBED_BATCH_SIZE = 20
/** 埋め込めなかった記事を、次に試すまでの間隔 */
const RETRY_AFTER_SEC = 24 * 60 * 60

type Work = { item: PendingItem; text: string }

function skipped(item: PendingItem): EmbeddingRecord {
  return { itemId: item.id, model: null, sourceKey: item.source_key }
}

async function embedAndRecord(
  db: D1Database,
  deps: EmbeddingDeps,
  work: readonly Work[],
  now: number,
): Promise<void> {
  const vectors = await deps.embed(work.map((entry) => entry.text))
  await deps.index.upsert(
    work.map((entry, i) => ({ id: String(entry.item.id), values: vectors[i] ?? [] })),
  )
  await db.batch(
    recordEmbeddingsStatements(
      db,
      work.map(({ item }) => ({
        itemId: item.id,
        model: EMBEDDING_MODEL,
        sourceKey: item.source_key,
      })),
      now,
    ),
  )
}

/**
 * 失敗したバッチを1件ずつ試し、埋め込めた件数を返す
 * 他の記事が通るのに失敗する記事は、その記事に原因があるとみなして埋め込めなかった記録を付ける
 * 全件が失敗した時はサービスの障害とみなし、記録を付けずに例外を投げる
 */
async function embedOneByOne(
  db: D1Database,
  deps: EmbeddingDeps,
  work: readonly Work[],
  now: number,
): Promise<number> {
  const failed: { item: PendingItem; message: string }[] = []
  for (const entry of work) {
    try {
      await embedAndRecord(db, deps, [entry], now)
    } catch (error) {
      failed.push({ item: entry.item, message: String(error) })
    }
  }
  const embedded = work.length - failed.length
  const first = failed[0]
  if (first === undefined) {
    return embedded
  }
  if (embedded === 0) {
    throw new Error(first.message)
  }
  await db.batch(
    recordEmbeddingsStatements(
      db,
      failed.map(({ item }) => skipped(item)),
      now,
    ),
  )
  console.error({
    event: 'embedding.item_failed',
    items: failed.map(({ item }) => item.id),
    message: first.message,
  })
  return embedded
}

/**
 * 未処理の記事を埋め込んでインデックスに入れる。既存の記事もこの処理が少しずつ進める
 * 失敗したバッチは記録せず、次の実行で拾う。1つのバッチの失敗で残りを止めない
 */
export async function embedPendingItems(
  db: D1Database,
  deps: EmbeddingDeps,
  now: number,
): Promise<void> {
  const items = await listPendingItems(
    db,
    EMBEDDING_MODEL,
    now - RETRY_AFTER_SEC,
    EMBED_LIMIT_PER_RUN,
  )
  if (items.length === 0) {
    return
  }
  const work: Work[] = []
  const empty: EmbeddingRecord[] = []
  for (const item of items) {
    const text = embeddingText(item)
    if (text === null) {
      empty.push(skipped(item))
    } else {
      work.push({ item, text })
    }
  }
  if (empty.length > 0) {
    await db.batch(recordEmbeddingsStatements(db, empty, now))
  }
  let embedded = 0
  // 障害の時に呼び出しを増やしすぎないよう、1件ずつ試すのは1回の実行で1バッチだけにする
  let canSplit = true
  const failures: string[] = []
  for (let start = 0; start < work.length; start += EMBED_BATCH_SIZE) {
    const batch = work.slice(start, start + EMBED_BATCH_SIZE)
    try {
      await embedAndRecord(db, deps, batch, now)
      embedded += batch.length
    } catch (error) {
      if (!canSplit || batch.length === 1) {
        failures.push(String(error))
        continue
      }
      canSplit = false
      try {
        embedded += await embedOneByOne(db, deps, batch, now)
      } catch (splitError) {
        failures.push(String(splitError))
      }
    }
  }
  console.log({ event: 'embedding.embed', pending: items.length, embedded })
  if (failures.length > 0) {
    throw new Error(`${failures.length} embedding batches failed: ${failures[0]}`)
  }
}

const PURGE_LIMIT_PER_RUN = 1000
const PURGE_BATCH_SIZE = 100

/** 記事が消えて台帳から外れたベクトルを、インデックスからも消す */
export async function purgeDeletedVectors(db: D1Database, deps: EmbeddingDeps): Promise<void> {
  const itemIds = await listDeletions(db, PURGE_LIMIT_PER_RUN)
  for (let start = 0; start < itemIds.length; start += PURGE_BATCH_SIZE) {
    const batch = itemIds.slice(start, start + PURGE_BATCH_SIZE)
    await deps.index.deleteByIds(batch.map(String))
    await clearDeletions(db, batch)
  }
  if (itemIds.length > 0) {
    console.log({ event: 'embedding.purge', purged: itemIds.length })
  }
}

export const SIMILAR_LIMIT = 5
/** これ未満の類似度の記事は出さない。embeddinggemmaは無関係な記事同士でも0.6前後になる */
export const SIMILAR_MIN_SCORE = 0.75
// 自分自身と、消えた記事のベクトルが混ざる分を見込んで多めに引く
const SIMILAR_TOP_K = SIMILAR_LIMIT + 7

export type SimilarItem = ItemForList & { score: number }

export async function findSimilarItems(
  db: D1Database,
  deps: EmbeddingDeps,
  itemId: number,
): Promise<SimilarItem[]> {
  // インデックスに無いIDを問い合わせないよう、先に台帳を見る
  if (!(await hasEmbedding(db, itemId, EMBEDDING_MODEL))) {
    return []
  }
  const matches = (await deps.index.queryById(String(itemId), SIMILAR_TOP_K))
    .map((match) => ({ id: Number(match.id), score: match.score }))
    .filter(
      (match) =>
        Number.isInteger(match.id) && match.id !== itemId && match.score >= SIMILAR_MIN_SCORE,
    )
    .sort((a, b) => b.score - a.score)
  if (matches.length === 0) {
    return []
  }
  const items = await getListItems(
    db,
    matches.map((match) => match.id),
  )
  const similar: SimilarItem[] = []
  for (const match of matches) {
    const item = items.get(match.id)
    if (item !== undefined) {
      similar.push({ ...item, score: match.score })
    }
    if (similar.length === SIMILAR_LIMIT) {
      break
    }
  }
  return similar
}
