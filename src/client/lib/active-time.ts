/** 最後の操作からこの時間が過ぎたら、離席したと見なして数えるのをやめる */
export const IDLE_LIMIT_MS = 60_000

export type ActiveTimer = {
  /** ユーザーの操作があった時に呼ぶ。フォーカスが無い間の操作は数えない */
  activity: (at: number) => void
  /** ウィンドウがフォーカスを失った時に呼ぶ */
  pause: (at: number) => void
  /** ウィンドウがフォーカスを得た時に呼ぶ */
  resume: (at: number) => void
  /** 貯めた時間を返して0に戻す。次の操作か`resume`まで計測を止める */
  flush: (at: number) => number
}

/**
 * 記事を実際に読んでいた時間を測る
 * 数えるのは、ウィンドウにフォーカスがあり、かつ最後の操作から`IDLE_LIMIT_MS`以内の時間だけ
 * 時刻はすべて引数で受け取る。単位はミリ秒
 */
export function createActiveTimer(startedAt: number, focused: boolean): ActiveTimer {
  let hasFocus = focused
  let lastActivity: number | null = focused ? startedAt : null
  let total = 0

  function settle(at: number) {
    if (lastActivity !== null) {
      total += Math.min(Math.max(at - lastActivity, 0), IDLE_LIMIT_MS)
    }
  }

  return {
    activity(at) {
      if (!hasFocus) {
        return
      }
      settle(at)
      lastActivity = at
    },
    pause(at) {
      settle(at)
      lastActivity = null
      hasFocus = false
    },
    resume(at) {
      settle(at)
      lastActivity = at
      hasFocus = true
    },
    flush(at) {
      settle(at)
      lastActivity = null
      const elapsed = total
      total = 0
      return elapsed
    },
  }
}
