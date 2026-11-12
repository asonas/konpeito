export type Sample = { score: number; positive: boolean; weight: number }

export const MIN_LABELS = 30
export const MIN_PER_CLASS = 5
/** 採点のゆらぎで入れ替わり続けないよう、これだけ上回った時だけ採用する */
export const MIN_AUC_GAIN = 0.02

/**
 * 重み付きAUC。正例と負例の組ごとに、正例のスコアが高ければ1、同点なら0.5を、2つの重みの積で数える
 * 正例か負例が無ければ`null`
 */
export function weightedAuc(samples: readonly Sample[]): number | null {
  const positives = samples.filter((s) => s.positive)
  const negatives = samples.filter((s) => !s.positive)
  let total = 0
  let won = 0
  for (const p of positives) {
    for (const n of negatives) {
      const weight = p.weight * n.weight
      total += weight
      if (p.score > n.score) {
        won += weight
      } else if (p.score === n.score) {
        won += weight / 2
      }
    }
  }
  return total === 0 ? null : won / total
}

export function hasEnoughLabels(labels: readonly { positive: boolean }[]): boolean {
  const positives = labels.filter((label) => label.positive).length
  const negatives = labels.length - positives
  return labels.length >= MIN_LABELS && positives >= MIN_PER_CLASS && negatives >= MIN_PER_CLASS
}

export function shouldAdopt(active: number | null, candidate: number | null): boolean {
  if (candidate === null) {
    return false
  }
  return active === null || candidate >= active + MIN_AUC_GAIN
}
