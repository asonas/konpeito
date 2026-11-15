import { describe, expect, it } from 'vitest'
import { createActiveTimer, IDLE_LIMIT_MS } from './active-time.ts'

describe('createActiveTimer', () => {
  it('操作が続いている間の時間をそのまま数える', () => {
    const timer = createActiveTimer(0, true)
    timer.activity(20_000)
    timer.activity(50_000)
    expect(timer.flush(70_000)).toBe(70_000)
  })

  it('最後の操作から上限を超えた分は数えない', () => {
    const timer = createActiveTimer(0, true)
    timer.activity(10_000)
    // 10秒の時点から10分放置して戻ってきた
    timer.activity(610_000)
    expect(timer.flush(615_000)).toBe(10_000 + IDLE_LIMIT_MS + 5_000)
  })

  it('フォーカスが無い間は、操作があっても数えない', () => {
    const timer = createActiveTimer(0, true)
    timer.pause(10_000)
    timer.activity(20_000)
    timer.activity(30_000)
    timer.resume(40_000)
    expect(timer.flush(45_000)).toBe(15_000)
  })

  it('フォーカスが無い状態で始めたら、フォーカスを得るまで数えない', () => {
    const timer = createActiveTimer(0, false)
    timer.resume(30_000)
    expect(timer.flush(40_000)).toBe(10_000)
  })

  it('返した時間は次に持ち越さず、再開するまでは操作があっても数えない', () => {
    const timer = createActiveTimer(0, true)
    expect(timer.flush(10_000)).toBe(10_000)
    timer.activity(20_000)
    timer.activity(30_000)
    timer.resume(100_000)
    expect(timer.flush(105_000)).toBe(5_000)
  })
})
