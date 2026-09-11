import { useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
  useRouterState,
} from '@tanstack/react-router'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ReaderApp } from '../components/ReaderApp.tsx'
import { useLiveBootstrap } from '../lib/bootstrap.ts'
import { FeedRefreshProvider } from '../lib/feed-refresh.tsx'
import { legacyUrlRedirect, queryFilterRedirect } from '../lib/legacy-url.ts'
import { fetchItem, loadBootstrap, queryKeys } from '../lib/queries.ts'
import { isNumericRef } from '../lib/refs.ts'
import { parseReaderSearch } from '../lib/search-params.ts'
import { sourceFromRoute } from '../lib/sources.ts'

export const Route = createFileRoute('/_reader')({
  validateSearch: parseReaderSearch,
  beforeLoad: async ({ context }) => loadBootstrap(context.queryClient),
  component: ReaderLayout,
})

const SettingsReturnContext = createContext('/')

export function useSettingsReturn(): string {
  return useContext(SettingsReturnContext)
}

function isSettingsPath(pathname: string): boolean {
  return pathname === '/settings' || pathname.startsWith('/settings/')
}

function ReaderLayout() {
  const location = useRouterState({
    select: (state) => ({ pathname: state.location.pathname, href: state.location.href }),
  })
  const [returnTo, setReturnTo] = useState('/')
  useEffect(() => {
    if (isSettingsPath(location.pathname)) {
      return
    }
    const url = new URL(location.href, window.location.origin)
    setReturnTo(`${url.pathname}${url.search}`)
  }, [location.href, location.pathname])
  return (
    <SettingsReturnContext.Provider value={returnTo}>
      <ReaderWithRefresh />
    </SettingsReturnContext.Provider>
  )
}

function ReaderWithRefresh() {
  const bootstrap = useLiveBootstrap()
  return (
    <FeedRefreshProvider feeds={bootstrap.feeds}>
      <ReaderFromRoute />
      <Outlet />
    </FeedRefreshProvider>
  )
}

function ReaderFromRoute() {
  const bootstrap = useLiveBootstrap()
  const search = Route.useSearch()
  const params = useParams({ strict: false })
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const navigate = useNavigate()
  const { feedId: feedRef, tagId: tagRef, itemId: itemRef } = params
  const onSettings = isSettingsPath(pathname)
  const onSearch = pathname === '/search' || pathname.startsWith('/search/')
  const onUnread = pathname === '/unread' || pathname.startsWith('/unread/')
  const onBookmarks = pathname === '/bookmarks' || pathname.startsWith('/bookmarks/')

  const legacyItem = itemRef !== undefined && isNumericRef(itemRef)
  const itemQuery = useQuery({
    queryKey: queryKeys.item(itemRef ?? ''),
    queryFn: () => fetchItem(itemRef ?? ''),
    enabled: legacyItem,
  })
  const itemPublicId = itemQuery.data?.public_id ?? undefined
  useEffect(() => {
    if (onSettings) {
      return
    }
    const input = {
      feedRef,
      tagRef,
      itemRef,
      onSearch,
      onUnread,
      onBookmarks,
      search,
      feeds: bootstrap.feeds,
      tags: bootstrap.tags,
      itemPublicId,
    }
    const legacy = legacyUrlRedirect(input)
    if (legacy.kind === 'waiting') {
      return
    }
    const result = legacy.kind === 'redirect' ? legacy : queryFilterRedirect(input)
    if (result.kind === 'redirect') {
      void navigate({ ...result.href, replace: true })
    }
  }, [
    bootstrap.feeds,
    bootstrap.tags,
    feedRef,
    itemPublicId,
    itemRef,
    navigate,
    onBookmarks,
    onSearch,
    onSettings,
    onUnread,
    search,
    tagRef,
  ])

  const live = {
    source: sourceFromRoute({
      onSearch,
      onUnread,
      onBookmarks,
      q: search.q,
      feedRef,
      tagRef,
      feeds: bootstrap.feeds,
      tags: bootstrap.tags,
    }),
    filter: search.filter,
    order: search.order,
    itemRef,
  }
  const held = useRef(live)
  if (!onSettings) {
    held.current = live
  }
  const view = onSettings ? held.current : live

  return (
    <ReaderApp
      source={view.source}
      filter={view.filter}
      order={view.order}
      itemRef={view.itemRef}
      bootstrap={bootstrap}
    />
  )
}
