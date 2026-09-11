import type { DiscoverFailure, DiscoverResult, FeedCandidate } from '../services/discovery.ts'
import { discoverFeeds, findSubscribedFeedId, normalizeFeedUrl } from '../services/discovery.ts'
import { nowSec } from './crypto.ts'

export async function subscribedByUrl(db: D1Database): Promise<Map<string, number>> {
  const rows = await db
    .prepare('SELECT id, feed_url, effective_url FROM feeds')
    .all<{ id: number; feed_url: string; effective_url: string | null }>()
  const map = new Map<string, number>()
  for (const row of rows.results) {
    map.set(row.feed_url, row.id)
    map.set(normalizeFeedUrl(row.feed_url), row.id)
    if (row.effective_url) {
      map.set(row.effective_url, row.id)
      map.set(normalizeFeedUrl(row.effective_url), row.id)
    }
  }
  return map
}

export function firstNewCandidate(result: DiscoverResult): FeedCandidate | null {
  return result.candidates.find((candidate) => candidate.subscribedFeedId === null) ?? null
}

export function subscribedCandidateId(result: DiscoverResult): number | null {
  if (firstNewCandidate(result) !== null) {
    return null
  }
  return (
    result.candidates.find((candidate) => candidate.subscribedFeedId !== null)?.subscribedFeedId ??
    null
  )
}

export { findSubscribedFeedId }

export async function discoverFromUrl(env: Env, url: string): Promise<DiscoverResult> {
  return discoverFeeds(url, {
    fetch,
    now: nowSec,
    subscribedByUrl: await subscribedByUrl(env.DB),
  })
}

export function describeDiscoverFailure(failure: DiscoverFailure | null): string {
  if (failure === null) {
    return 'No feed found'
  }
  const status = failure.status === null ? '' : ` (HTTP ${failure.status})`
  return `No feed found: ${failure.errorKind}${status}`
}
