import { describe, expect, it } from 'vitest'
import { MIN_AUC_GAIN, shouldAdopt, weightedAuc } from './evaluate.ts'

describe('weightedAuc', () => {
  it('weights each positive-negative pair by the product of their weights', () => {
    const auc = weightedAuc([
      { score: 0.9, positive: true, weight: 1 },
      { score: 0.2, positive: false, weight: 1 },
      { score: 0.5, positive: false, weight: 0.5 },
      { score: 0.4, positive: true, weight: 0.5 },
    ])
    // 組の重みと勝敗: (0.9,0.2)=1勝, (0.9,0.5)=0.5勝, (0.4,0.2)=0.5勝, (0.4,0.5)=0.25負
    expect(auc).toBeCloseTo(2 / 2.25)
  })

  it('is null without both classes', () => {
    expect(weightedAuc([{ score: 1, positive: true, weight: 1 }])).toBeNull()
  })
})

describe('shouldAdopt', () => {
  it('requires the candidate to beat the active version by the margin', () => {
    expect(shouldAdopt(0.7, 0.7 + MIN_AUC_GAIN)).toBe(true)
    expect(shouldAdopt(0.7, 0.7 + MIN_AUC_GAIN / 2)).toBe(false)
    expect(shouldAdopt(0.7, null)).toBe(false)
  })
})
