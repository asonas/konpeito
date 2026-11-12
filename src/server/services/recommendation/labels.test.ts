import { describe, expect, it } from 'vitest'
import { deriveLabels, type EventRow, UNOPENED_AFTER } from './labels.ts'

const NOW = 1_000_000

function event(item_id: number, kind: string, created_at: number, dwell_ms?: number): EventRow {
  return { item_id, kind, created_at, dwell_ms: dwell_ms ?? null }
}

describe('deriveLabels', () => {
  it('lets an explicit dislike override a star, and a cleared rating fall back to the star', () => {
    const labels = deriveLabels(
      [
        event(1, 'like', 10),
        event(1, 'dislike', 20),
        event(2, 'dislike', 10),
        event(2, 'clear_feedback', 20),
      ],
      [
        { id: 1, starred_at: 30 },
        { id: 2, starred_at: 30 },
      ],
      NOW,
    )
    expect(labels).toEqual([
      { itemId: 1, positive: false, weight: 1, at: 20 },
      { itemId: 2, positive: true, weight: 1, at: 30 },
    ])
  })

  it('treats an unopened impression as a weak negative only after the waiting period', () => {
    const shown = NOW - UNOPENED_AFTER
    const labels = deriveLabels(
      [
        event(1, 'impression', shown),
        event(2, 'impression', shown + 1),
        event(3, 'impression', shown),
        event(3, 'open', shown + 10),
        event(3, 'close', shown + 20, 5_000),
        event(4, 'open', shown),
        event(4, 'close', shown + 40, 40_000),
      ],
      [],
      NOW,
    )
    expect(labels).toEqual([
      { itemId: 1, positive: false, weight: 0.5, at: NOW },
      { itemId: 4, positive: true, weight: 0.5, at: shown + 40 },
    ])
  })

  it('dates a label that a cleared rating changed at the time of clearing', () => {
    const labels = deriveLabels(
      [event(1, 'dislike', 10), event(1, 'clear_feedback', 500)],
      [{ id: 1, starred_at: 5 }],
      NOW,
    )
    expect(labels).toEqual([{ itemId: 1, positive: true, weight: 1, at: 500 }])
  })
})
