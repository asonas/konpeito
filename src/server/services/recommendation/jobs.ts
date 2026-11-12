import type { ApiFailure } from './http.ts'
import { DEFAULT_JEV_MODEL, JEV_BATCH_SIZE, type JevDeps, scoreItems } from './jev.ts'
import {
  getActiveVersion,
  listUnscoredItems,
  type ScorableItem,
  saveScoresStatements,
} from './store.ts'

const DAY = 24 * 60 * 60
const SCORE_WINDOW = 7 * DAY
const SCORE_LIMIT_PER_RUN = JEV_BATCH_SIZE * 2

export function jevDeps(env: Env): JevDeps | null {
  if (!env.JEV_API_KEY) {
    return null
  }
  return {
    fetch: globalThis.fetch,
    apiKey: env.JEV_API_KEY,
    model: env.JEV_MODEL || DEFAULT_JEV_MODEL,
  }
}

/** 途中のバッチが失敗したら、それまでの結果を捨てずに返す */
export async function scoreInBatches(
  items: readonly ScorableItem[],
  preference: string,
  deps: JevDeps,
): Promise<{ scores: Map<number, number>; failure: ApiFailure | null }> {
  const scores = new Map<number, number>()
  for (let start = 0; start < items.length; start += JEV_BATCH_SIZE) {
    const batch = items.slice(start, start + JEV_BATCH_SIZE)
    const result = await scoreItems(batch, preference, deps)
    if (result.kind !== 'ok') {
      return { scores, failure: result }
    }
    batch.forEach((item, i) => {
      const score = result.scores[i]
      if (score !== undefined) {
        scores.set(item.id, score)
      }
    })
  }
  return { scores, failure: null }
}

export async function scorePendingItems(env: Env, now: number): Promise<void> {
  const deps = jevDeps(env)
  if (deps === null) {
    return
  }
  const active = await getActiveVersion(env.DB)
  if (active === null) {
    return
  }
  const items = await listUnscoredItems(env.DB, active.id, now - SCORE_WINDOW, SCORE_LIMIT_PER_RUN)
  if (items.length === 0) {
    return
  }
  const { scores, failure } = await scoreInBatches(items, active.body, deps)
  if (scores.size > 0) {
    await env.DB.batch(saveScoresStatements(env.DB, active.id, scores, now))
  }
  console.log({
    event: 'recommendation.score',
    version: active.id,
    scored: scores.size,
    ...(failure !== null ? { failure } : {}),
  })
}
