import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect } from 'react'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { createActiveTimer } from '../../lib/active-time.ts'
import {
  type Feedback,
  fetchFeedback,
  type ItemEventKind,
  postItemEvent,
  queryKeys,
} from '../../lib/queries.ts'
import { isBackgroundOpenKey, recordItemEvent } from '../../lib/reading-events.ts'
import { Button } from '../ui/button.tsx'
import { AppTooltip } from '../ui/tooltip.tsx'

const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
] as const

/**
 * 記事を開いた事と、実際に読んでいた時間を記録する
 * 閲覧時間は、タブが隠れる・ページを離れる・記事を閉じるたびに区切って送り、サーバー側で合計する
 * 隠れたままブラウザーが終了されると`pagehide`が来ないので、隠れた時点で送っておく
 */
export function useReadingSession(itemId: number | undefined, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || itemId === undefined) {
      return
    }
    recordItemEvent(itemId, 'open')
    const isActive = () => document.visibilityState === 'visible' && document.hasFocus()
    const timer = createActiveTimer(Date.now(), isActive())
    const flush = () => {
      const elapsed = timer.flush(Date.now())
      if (elapsed > 0) {
        recordItemEvent(itemId, 'close', elapsed)
      }
    }
    const resume = () => {
      if (isActive()) {
        timer.resume(Date.now())
      }
    }
    const onActivity = () => timer.activity(Date.now())
    const onBlur = () => timer.pause(Date.now())
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        resume()
      } else {
        flush()
      }
    }
    // BFCacheから戻ったページでは、同じ記事の新しい区間として測り直す
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        resume()
      }
    }
    // `scroll`はバブリングしないので、記事ペインの中のスクロールもcaptureで拾う
    const options = { capture: true, passive: true }
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, options)
    }
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, onActivity, options)
      }
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('pageshow', onPageShow)
      flush()
    }
  }, [enabled, itemId])
}

/** Feedly Background Tabのキー入力で元記事が開かれた事を記録する。条件は`isBackgroundOpenKey`を参照 */
export function useBackgroundOpenSignal(itemId: number | undefined, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || itemId === undefined) {
      return
    }
    const onKeyPress = (event: KeyboardEvent) => {
      if (isBackgroundOpenKey(event)) {
        recordItemEvent(itemId, 'open_original')
      }
    }
    window.addEventListener('keypress', onKeyPress)
    return () => window.removeEventListener('keypress', onKeyPress)
  }, [enabled, itemId])
}

export function FeedbackButtons(props: { itemId: number }) {
  const t = useMessages()
  const queryClient = useQueryClient()
  const queryKey = queryKeys.feedback(props.itemId)
  const query = useQuery({ queryKey, queryFn: () => fetchFeedback(props.itemId) })
  const current = query.data ?? null
  const mutation = useMutation({
    mutationFn: (kind: ItemEventKind) => postItemEvent(props.itemId, kind),
    onMutate: async (kind) => {
      // 取得中の古い値が、後から楽観的な更新を上書きしないようにする
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Feedback>(queryKey)
      queryClient.setQueryData<Feedback>(
        queryKey,
        kind === 'clear_feedback' ? null : (kind as Feedback),
      )
      return { previous }
    },
    onError: (_error, _kind, context) => {
      queryClient.setQueryData<Feedback>(queryKey, context?.previous ?? null)
    },
    // 送信中はボタンを止めて更新を重ねないので、完了後の再取得が次の楽観的な更新を上書きする事は無い
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
  const toggle = (kind: 'like' | 'dislike') => {
    mutation.mutate(current === kind ? 'clear_feedback' : kind)
  }
  return (
    <>
      <AppTooltip label={t.article.like}>
        <Button
          variant={current === 'like' ? 'toggle' : 'ghost'}
          size="icon"
          aria-label={t.article.like}
          aria-pressed={current === 'like'}
          disabled={mutation.isPending}
          onClick={() => toggle('like')}
        >
          <ThumbsUp className="h-4 w-4" />
        </Button>
      </AppTooltip>
      <AppTooltip label={t.article.dislike}>
        <Button
          variant={current === 'dislike' ? 'toggle' : 'ghost'}
          size="icon"
          aria-label={t.article.dislike}
          aria-pressed={current === 'dislike'}
          disabled={mutation.isPending}
          onClick={() => toggle('dislike')}
        >
          <ThumbsDown className="h-4 w-4" />
        </Button>
      </AppTooltip>
    </>
  )
}
