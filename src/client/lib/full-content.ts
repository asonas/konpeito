import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnnounce } from '../components/LiveRegion.tsx'
import type { Messages } from '../i18n/en.ts'
import { getMessages } from '../i18n/locale.ts'
import { ApiError } from './http.ts'
import { useNotify } from './notify.ts'
import { type Feed, fetchFullContent, fetchItem, type ItemDetail, queryKeys } from './queries.ts'

export interface FullContentView {
  shown: boolean
  busy: boolean
  toggle: () => void
  requestShow: () => void
}

export function resolveFullContentShown(input: {
  hasFullContent: boolean
  feedDefault: boolean
  override: boolean | undefined
}): boolean {
  if (!input.hasFullContent) {
    return false
  }
  return input.override ?? input.feedDefault
}

export function feedDefaultOf(
  feeds: readonly Pick<Feed, 'id' | 'fetch_full_content'>[],
  feedId: number,
): boolean {
  return feeds.some((feed) => feed.id === feedId && feed.fetch_full_content === 1)
}

export function fullContentFailureMessage(
  error: unknown,
  messages: Messages = getMessages(),
): string {
  const base = messages.fullContent.failed
  if (!(error instanceof ApiError) || error.code !== 'extract_failed') {
    return base
  }
  const reason = /\(([a-z0-9_]+)\)$/.exec(error.message)?.[1]
  if (reason === undefined) {
    return base
  }
  const http = /^http_(\d{3})$/.exec(reason)
  if (http?.[1] !== undefined) {
    return messages.fullContent.failedHttp(http[1])
  }
  const known = messages.fullContent.reasons
  if (Object.hasOwn(known, reason)) {
    return messages.fullContent.failedWith(known[reason as keyof typeof known])
  }
  return base
}

export function useFullContent(itemRef: string | undefined, feeds: Feed[]): FullContentView {
  const queryClient = useQueryClient()
  const notify = useNotify()
  const announce = useAnnounce()
  const query = useQuery({
    queryKey: queryKeys.item(itemRef ?? ''),
    queryFn: () => fetchItem(itemRef ?? ''),
    enabled: itemRef !== undefined,
  })
  const item = query.data
  const [override, setOverride] = useState<{ ref: string; full: boolean } | null>(null)
  const attemptedRef = useRef<string | undefined>(undefined)
  const pendingShow = useRef(false)

  const feedDefault = item !== undefined && feedDefaultOf(feeds, item.feed_id)
  const overrideFor = override !== null && override.ref === itemRef ? override.full : undefined
  const shown =
    item !== undefined &&
    resolveFullContentShown({
      hasFullContent: item.full_content_html !== null,
      feedDefault,
      override: overrideFor,
    })

  const fetching = useMutation({
    mutationFn: (vars: { id: number; ref: string }) => fetchFullContent(vars.id),
    onSuccess: (data, vars) => {
      queryClient.setQueriesData<ItemDetail>({ queryKey: ['item'] }, (cached) =>
        cached === undefined || cached.id !== vars.id
          ? cached
          : { ...cached, full_content_html: data.html, has_full_content: true },
      )
      setOverride({ ref: vars.ref, full: true })
      announce(getMessages().article.shownFull)
      void queryClient.invalidateQueries({ queryKey: queryKeys.item(vars.ref) })
    },
    onError: (error) => notify(fullContentFailureMessage(error), 'destructive'),
  })
  const mutate = fetching.mutate

  useEffect(() => {
    if (itemRef === undefined || item === undefined) {
      return
    }
    if (!feedDefault || item.full_content_html !== null || item.url === null) {
      return
    }
    if (overrideFor !== undefined || attemptedRef.current === itemRef) {
      return
    }
    attemptedRef.current = itemRef
    mutate({ id: item.id, ref: itemRef })
  }, [itemRef, item, feedDefault, overrideFor, mutate])

  function toggle() {
    if (itemRef === undefined || item === undefined || item.url === null || fetching.isPending) {
      return
    }
    if (item.full_content_html === null) {
      mutate({ id: item.id, ref: itemRef })
      return
    }
    const next = !shown
    setOverride({ ref: itemRef, full: next })
    announce(next ? getMessages().article.shownFull : getMessages().article.shownFeed)
  }

  const tryShowFull = useCallback(() => {
    if (!pendingShow.current) {
      return
    }
    if (itemRef === undefined || item === undefined || item.url === null || fetching.isPending) {
      return
    }
    pendingShow.current = false
    if (item.full_content_html === null) {
      mutate({ id: item.id, ref: itemRef })
      return
    }
    if (!shown) {
      setOverride({ ref: itemRef, full: true })
      announce(getMessages().article.shownFull)
    }
  }, [announce, fetching.isPending, item, itemRef, mutate, shown])

  useEffect(() => {
    tryShowFull()
  }, [tryShowFull])

  const requestShow = useCallback(() => {
    pendingShow.current = true
    tryShowFull()
  }, [tryShowFull])

  return { shown, busy: fetching.isPending, toggle, requestShow }
}
