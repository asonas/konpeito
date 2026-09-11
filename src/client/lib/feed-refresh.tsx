import { useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { getMessages } from '../i18n/locale.ts'
import { errorMessage } from './http.ts'
import { useNotify } from './notify.ts'
import { type Feed, queryKeys, refreshFeed } from './queries.ts'

const POLL_MS = 1500
const TIMEOUT_MS = 90_000

interface FeedRefreshApi {
  isRefreshing: (feedId: number) => boolean
  refresh: (feed: Pick<Feed, 'id' | 'last_fetch_at'>) => Promise<void>
}

const FeedRefreshContext = createContext<FeedRefreshApi | null>(null)

export function FeedRefreshProvider(props: { feeds: Feed[]; children: ReactNode }) {
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [pending, setPending] = useState<Map<number, number>>(() => new Map())

  useEffect(() => {
    if (pending.size === 0) {
      return
    }
    const finished: number[] = []
    const vanished: number[] = []
    for (const [id, snapshot] of pending) {
      const feed = props.feeds.find((entry) => entry.id === id)
      if (feed === undefined) {
        vanished.push(id)
        continue
      }
      if ((feed.last_fetch_at ?? -1) !== snapshot) {
        finished.push(id)
      }
    }
    if (finished.length === 0 && vanished.length === 0) {
      return
    }
    setPending((current) => {
      const next = new Map(current)
      for (const id of [...finished, ...vanished]) {
        next.delete(id)
      }
      return next
    })
    if (finished.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ['items'] })
    }
  }, [props.feeds, pending, queryClient])

  useEffect(() => {
    if (pending.size === 0) {
      return
    }
    const poll = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
    }, POLL_MS)
    const timeout = window.setTimeout(() => {
      setPending(new Map())
    }, TIMEOUT_MS)
    return () => {
      window.clearInterval(poll)
      window.clearTimeout(timeout)
    }
  }, [pending.size, queryClient])

  const api: FeedRefreshApi = {
    isRefreshing: (feedId) => pending.has(feedId),
    refresh: async (feed) => {
      const snapshot = feed.last_fetch_at ?? -1
      setPending((current) => new Map(current).set(feed.id, snapshot))
      try {
        await refreshFeed(feed.id)
        await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
      } catch (error) {
        setPending((current) => {
          const next = new Map(current)
          next.delete(feed.id)
          return next
        })
        notify(errorMessage(error, getMessages().settings.data.refreshAllFailed), 'destructive')
      }
    },
  }

  return <FeedRefreshContext.Provider value={api}>{props.children}</FeedRefreshContext.Provider>
}

export function useFeedRefresh(): FeedRefreshApi {
  const value = useContext(FeedRefreshContext)
  if (value === null) {
    throw new Error('useFeedRefresh requires FeedRefreshProvider')
  }
  return value
}
