const DAY = 24 * 60 * 60

export const STRONG_WEIGHT = 1
export const WEAK_WEIGHT = 0.5
export const DWELL_THRESHOLD_MS = 30_000
/** 表示されてからこの秒数が過ぎても開かれていなければ、読まなかったと見なす */
export const UNOPENED_AFTER = DAY

export type EventRow = {
  item_id: number
  kind: string
  dwell_ms: number | null
  created_at: number
}

export type StarRow = { id: number; starred_at: number }

export type Label = {
  itemId: number
  positive: boolean
  weight: number
  /** ラベルが確定した時刻。前回の学習より新しいラベルを数えるのに使う */
  at: number
}

type ItemSignals = {
  explicit: { kind: string; at: number } | null
  dwellMs: number
  lastClose: number
  opened: boolean
  firstImpression: number | null
}

function collect(events: readonly EventRow[]): Map<number, ItemSignals> {
  const byItem = new Map<number, ItemSignals>()
  for (const event of events) {
    let signals = byItem.get(event.item_id)
    if (signals === undefined) {
      signals = { explicit: null, dwellMs: 0, lastClose: 0, opened: false, firstImpression: null }
      byItem.set(event.item_id, signals)
    }
    switch (event.kind) {
      case 'like':
      case 'dislike':
      case 'clear_feedback':
        if (signals.explicit === null || event.created_at >= signals.explicit.at) {
          signals.explicit = { kind: event.kind, at: event.created_at }
        }
        break
      case 'open':
        signals.opened = true
        break
      case 'close':
        signals.opened = true
        signals.dwellMs += event.dwell_ms ?? 0
        signals.lastClose = Math.max(signals.lastClose, event.created_at)
        break
      case 'impression':
        signals.firstImpression = Math.min(
          signals.firstImpression ?? event.created_at,
          event.created_at,
        )
        break
    }
  }
  return byItem
}

/**
 * 記事ごとに1つのラベルを決める。優先順位は、明示的な評価、スター、閲覧時間、開かれなかった表示
 * 同じ`created_at`の明示的な評価は、後に渡されたものを採る
 */
export function deriveLabels(
  events: readonly EventRow[],
  stars: readonly StarRow[],
  now: number,
): Label[] {
  const signals = collect(events)
  const starred = new Map(stars.map((star) => [star.id, star.starred_at]))
  const ids = new Set([...signals.keys(), ...starred.keys()])
  const labels: Label[] = []
  for (const itemId of ids) {
    const s = signals.get(itemId)
    const explicit = s?.explicit ?? null
    if (explicit !== null && explicit.kind !== 'clear_feedback') {
      labels.push({
        itemId,
        positive: explicit.kind === 'like',
        weight: STRONG_WEIGHT,
        at: explicit.at,
      })
      continue
    }
    const starredAt = starred.get(itemId)
    if (starredAt !== undefined) {
      labels.push({ itemId, positive: true, weight: STRONG_WEIGHT, at: starredAt })
      continue
    }
    if (s === undefined) {
      continue
    }
    if (s.dwellMs >= DWELL_THRESHOLD_MS) {
      labels.push({ itemId, positive: true, weight: WEAK_WEIGHT, at: s.lastClose })
      continue
    }
    if (!s.opened && s.firstImpression !== null && s.firstImpression + UNOPENED_AFTER <= now) {
      labels.push({
        itemId,
        positive: false,
        weight: WEAK_WEIGHT,
        at: s.firstImpression + UNOPENED_AFTER,
      })
    }
  }
  return labels
}
