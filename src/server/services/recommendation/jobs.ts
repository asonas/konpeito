import { hasEnoughLabels, shouldAdopt, weightedAuc } from './evaluate.ts'
import type { ApiFailure } from './http.ts'
import { DEFAULT_JEV_MODEL, JEV_BATCH_SIZE, type JevDeps, scoreItems } from './jev.ts'
import { deriveLabels, type Label, STRONG_WEIGHT } from './labels.ts'
import {
  DEFAULT_OPENAI_MODEL,
  type FeedbackExample,
  type OpenAiDeps,
  proposePreference,
} from './openai.ts'
import {
  activateStatements,
  getActiveVersion,
  getScorableItems,
  insertCandidate,
  lastLearningAt,
  listUnscoredItems,
  loadLabelSources,
  rejectStatement,
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

const LEARNING_WINDOW = 60 * DAY
const MAX_LABELS = 150
const MAX_EXAMPLES = 80
const MIN_NEW_LABELS = 10

export function openAiDeps(env: Env): OpenAiDeps | null {
  if (!env.OPENAI_API_KEY) {
    return null
  }
  return {
    fetch: globalThis.fetch,
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
  }
}

export async function loadLabels(db: D1Database, now: number): Promise<Label[]> {
  const { events, stars } = await loadLabelSources(db, now - LEARNING_WINDOW)
  return deriveLabels(events, stars, now)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_LABELS)
}

function toExample(label: Label, item: ScorableItem): FeedbackExample {
  return {
    feed: item.feed,
    title: item.title,
    reaction: label.positive ? 'liked' : 'disliked',
    strength: label.weight >= STRONG_WEIGHT ? 'strong' : 'weak',
  }
}

/**
 * 反応から嗜好文の候補を作り、ラベル付きの記事を現行と候補の両方で採点して比べる
 * 候補が勝てば有効にし、負ければ却下として残す
 */
export async function runPreferenceLearning(env: Env, now: number): Promise<void> {
  const jev = jevDeps(env)
  const openai = openAiDeps(env)
  if (jev === null || openai === null) {
    return
  }
  const active = await getActiveVersion(env.DB)
  if (active === null) {
    return
  }
  const lastRun = await lastLearningAt(env.DB)
  const allLabels = await loadLabels(env.DB, now)
  const items = new Map(
    (
      await getScorableItems(
        env.DB,
        allLabels.map((label) => label.itemId),
      )
    ).map((item) => [item.id, item]),
  )
  const labels = allLabels.filter((label) => items.has(label.itemId))
  const fresh = labels.filter((label) => label.at > lastRun).length
  if (fresh < MIN_NEW_LABELS || !hasEnoughLabels(labels)) {
    console.log({ event: 'recommendation.learn.skip', labels: labels.length, fresh })
    return
  }

  const examples = labels.slice(0, MAX_EXAMPLES).flatMap((label) => {
    const item = items.get(label.itemId)
    return item === undefined ? [] : [toExample(label, item)]
  })
  const proposal = await proposePreference(active.body, examples, openai)
  if (proposal.kind !== 'ok') {
    console.log({ event: 'recommendation.learn.propose_failed', failure: proposal })
    return
  }
  const candidateId = await insertCandidate(env.DB, {
    body: proposal.preference,
    rationale: proposal.rationale,
    parentId: active.id,
    now,
  })
  try {
    await evaluateCandidate(env, now, {
      jev,
      openaiModel: openai.model,
      active,
      candidate: { id: candidateId, body: proposal.preference },
      labels,
      items,
    })
  } catch (error) {
    // 候補を`candidate`のまま残すと、評価が終わっていない版が履歴に残り続ける
    await rejectStatement(env.DB, candidateId, JSON.stringify({ error: String(error) })).run()
    throw error
  }
}

async function evaluateCandidate(
  env: Env,
  now: number,
  input: {
    jev: JevDeps
    openaiModel: string
    active: { id: number; body: string }
    candidate: { id: number; body: string }
    labels: readonly Label[]
    items: ReadonlyMap<number, ScorableItem>
  },
): Promise<void> {
  const { jev, active, candidate, labels } = input
  const labeledItems = labels.flatMap((label) => {
    const item = input.items.get(label.itemId)
    return item === undefined ? [] : [item]
  })
  // 保存済みのスコアは採点した時の記事の内容やバッチの組み合わせが違うので使わず、同じ入力で両方を採点し直す
  const activeRun = await scoreInBatches(labeledItems, active.body, jev)
  const candidateRun =
    activeRun.failure === null
      ? await scoreInBatches(labeledItems, candidate.body, jev)
      : { scores: new Map<number, number>(), failure: activeRun.failure }
  if (candidateRun.failure !== null) {
    await rejectStatement(
      env.DB,
      candidate.id,
      JSON.stringify({ error: candidateRun.failure }),
    ).run()
    console.log({ event: 'recommendation.learn.score_failed', failure: candidateRun.failure })
    return
  }

  const samples = (scores: ReadonlyMap<number, number>) =>
    labels.flatMap((label) => {
      const score = scores.get(label.itemId)
      return score === undefined ? [] : [{ score, positive: label.positive, weight: label.weight }]
    })
  const aucActive = weightedAuc(samples(activeRun.scores))
  const aucCandidate = weightedAuc(samples(candidateRun.scores))
  const adopted = shouldAdopt(aucActive, aucCandidate)
  const evaluation = {
    compared_with: active.id,
    labels: labels.length,
    positives: labels.filter((label) => label.positive).length,
    negatives: labels.filter((label) => !label.positive).length,
    auc_active: aucActive,
    auc_candidate: aucCandidate,
    model: { jev: jev.model, openai: input.openaiModel },
  }
  if (adopted) {
    await env.DB.batch(activateStatements(env.DB, candidate.id, active.id, evaluation, now))
  } else {
    await rejectStatement(env.DB, candidate.id, JSON.stringify(evaluation)).run()
  }
  console.log({
    event: 'recommendation.learn',
    candidate: candidate.id,
    adopted,
    auc_active: aucActive,
    auc_candidate: aucCandidate,
  })
}
