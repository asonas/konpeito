import { useCallback, useEffect, useRef } from 'react'
import { postItemEvent } from './queries.ts'

const VISIBLE_RATIO = 0.5

/**
 * 一覧の行が画面に半分以上入った時に、その記事の表示を1回だけ記録する
 * 仮想スクロールが先読みして描画しただけの行は数えない
 * 返す関数は行の`ref`から呼ぶ
 */
export function useImpressionTracker(
  enabled: boolean,
): (node: HTMLElement | null, itemId: number) => void {
  const observer = useRef<IntersectionObserver | null>(null)
  const idsByNode = useRef(new WeakMap<Element, number>())
  const sent = useRef(new Set<number>())

  // 一覧は別のビューへ移っても同じ行の要素を使い回すので、無効になった時点で観察をやめる
  useEffect(() => {
    if (enabled) {
      return
    }
    observer.current?.disconnect()
    observer.current = null
  }, [enabled])
  useEffect(() => {
    return () => {
      observer.current?.disconnect()
      observer.current = null
    }
  }, [])

  return useCallback(
    (node: HTMLElement | null, itemId: number) => {
      if (!enabled || node === null || typeof IntersectionObserver === 'undefined') {
        return
      }
      if (sent.current.has(itemId)) {
        return
      }
      // 行の`ref`は描画の後、effectより先に呼ばれるので、ここで作る
      observer.current ??= new IntersectionObserver(
        (entries, self) => {
          for (const entry of entries) {
            const id = idsByNode.current.get(entry.target)
            // `threshold`は通知する境界にすぎず、観察を始めた直後は半分未満でも`isIntersecting`で届く
            if (
              entry.intersectionRatio < VISIBLE_RATIO ||
              id === undefined ||
              sent.current.has(id)
            ) {
              continue
            }
            sent.current.add(id)
            self.unobserve(entry.target)
            const target = entry.target
            postItemEvent(id, 'impression').catch(() => {
              // 記録は推薦の学習にだけ使うので一覧の操作は止めず、次に表示された時に送り直す
              sent.current.delete(id)
              observer.current?.observe(target)
            })
          }
        },
        { threshold: VISIBLE_RATIO },
      )
      idsByNode.current.set(node, itemId)
      observer.current.observe(node)
    },
    [enabled],
  )
}
