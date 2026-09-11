import { nowSec } from './crypto.ts'

/**
 * フィード取得ジョブをQueueへ送るだけの軽いモジュール
 * ハンドラがfeedsmithなどを引き込まないようにするため`subscribe.ts`とは分けてある
 */
export async function enqueueFeed(
  env: Env,
  feedId: number,
  reason: 'scheduled' | 'manual' | 'subscribe',
): Promise<void> {
  await env.FEED_QUEUE.send({
    feedId,
    reason,
    enqueuedAt: nowSec(),
  })
}

/** 複数のフィードをまとめてQueueへ送る。1回のsendBatchは100件までなので分割する */
export async function enqueueFeeds(
  env: Env,
  feedIds: readonly number[],
  reason: 'scheduled' | 'manual' | 'subscribe',
): Promise<void> {
  const enqueuedAt = nowSec()
  for (let start = 0; start < feedIds.length; start += 100) {
    const chunk = feedIds.slice(start, start + 100)
    await env.FEED_QUEUE.sendBatch(
      chunk.map((feedId) => ({ body: { feedId, reason, enqueuedAt } })),
    )
  }
}
