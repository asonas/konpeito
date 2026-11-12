import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect } from 'react'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import {
  type Feedback,
  fetchFeedback,
  type ItemEventKind,
  postItemEvent,
  queryKeys,
} from '../../lib/queries.ts'
import { Button } from '../ui/button.tsx'
import { AppTooltip } from '../ui/tooltip.tsx'

function send(id: number, kind: ItemEventKind, dwellMs?: number): void {
  postItemEvent(id, kind, dwellMs).catch(() => {
    // 記録は推薦の学習にだけ使うので、失敗しても読書の操作は止めない
  })
}

/**
 * 記事を開いた事と、閉じるまでの閲覧時間を記録する
 * タブが隠れている間は閲覧時間に数えない
 */
export function useReadingSession(itemId: number | undefined, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || itemId === undefined) {
      return
    }
    send(itemId, 'open')
    let visibleMs = 0
    let visibleSince: number | null = document.visibilityState === 'visible' ? Date.now() : null
    let closed = false
    const pause = () => {
      if (visibleSince !== null) {
        visibleMs += Date.now() - visibleSince
        visibleSince = null
      }
    }
    const close = () => {
      if (closed) {
        return
      }
      closed = true
      pause()
      send(itemId, 'close', visibleMs)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        visibleSince ??= Date.now()
      } else {
        pause()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', close)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', close)
      close()
    }
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
    onMutate: (kind) => {
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
          onClick={() => toggle('dislike')}
        >
          <ThumbsDown className="h-4 w-4" />
        </Button>
      </AppTooltip>
    </>
  )
}
