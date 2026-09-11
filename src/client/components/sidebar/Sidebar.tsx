import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, LoaderCircle, Plus, Search, Settings } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { feedTitle } from '../../../shared/feed.ts'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { useFeedRefresh } from '../../lib/feed-refresh.tsx'
import { replaceFeedTag } from '../../lib/feed-tags.ts'
import { errorKindLabel } from '../../lib/format.ts'
import { sourceLink } from '../../lib/links.ts'
import { insertBefore } from '../../lib/order.ts'
import {
  type Feed,
  queryKeys,
  reorderFeeds,
  reorderTags,
  type Tag,
  updateFeed,
} from '../../lib/queries.ts'
import {
  DropIndicator,
  type FeedDragData,
  type FeedDropTarget,
  useFeedDrag,
  useReorderDrag,
} from '../../lib/reorder-drag.tsx'
import type { ReaderSearch, Source } from '../../lib/search-params.ts'
import { DEFAULT_SETTINGS_TAB } from '../../lib/settings-tabs.ts'
import { feedSource, sameSource, tagSource } from '../../lib/sources.ts'
import { cn } from '../../lib/utils.ts'
import { FeedIcon } from '../FeedIcon.tsx'
import { FeedContextItems } from '../item-list/SourceMenu.tsx'
import { Button } from '../ui/button.tsx'
import { ColumnHeader, useScrolled } from '../ui/column-header.tsx'
import { AppContextMenu, ContextMenuTrigger } from '../ui/context-menu.tsx'
import { DropdownItem, DropdownMenu } from '../ui/dropdown.tsx'
import { IconButton, IconLink } from '../ui/icon-button.tsx'
import { Input } from '../ui/input.tsx'
import { AppTooltip } from '../ui/tooltip.tsx'

const rowClassName =
  'flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-state-hover'

function SearchField(props: {
  initialQuery: string
  onClose: () => void
  onEscape: () => void
  onSubmit: (query: string) => void
}) {
  const t = useMessages()
  const [draft, setDraft] = useState(props.initialQuery)
  return (
    <search className="absolute inset-x-3 top-1/2 z-10 -translate-y-1/2">
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault()
          const query = draft.trim()
          if (query.length === 0) {
            return
          }
          props.onSubmit(query)
        }}
      >
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2"
        />
        <Input
          autoFocus
          type="search"
          id="reader-search"
          aria-label={t.common.search}
          size="sm"
          className="pl-8"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={props.onClose}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              props.onEscape()
            }
          }}
        />
      </form>
    </search>
  )
}

function UnreadBadge(props: { count: number; label?: string }) {
  const t = useMessages()
  if (props.count <= 0) {
    return null
  }
  return (
    <span className="ml-auto text-xs text-fg-muted tabular-nums">
      <span className="sr-only">{props.label ?? t.sidebar.unreadCount(props.count)}</span>
      <span aria-hidden="true">{props.count}</span>
    </span>
  )
}

function orderOnlySearch(search: ReaderSearch): ReaderSearch {
  const next: ReaderSearch = {}
  if (search.order !== undefined) {
    next.order = search.order
  }
  return next
}

export function Sidebar(props: {
  feeds: Feed[]
  tags: Tag[]
  unreadCount: number
  source: Source
  search: ReaderSearch
  unreadOnly: boolean
  searchOpen: boolean
  searchQuery: string
  onSearchOpen: () => void
  onSearchClose: () => void
  onSearchSubmit: (query: string) => void
  onAddFeed: () => void
  onCreateTag: () => void
  onEditFeed: (feed: Feed) => void
  onUnsubscribe: (feed: Feed) => void
  onNavigate?: () => void
  readOnly: boolean
  onAddLocked: () => void
}) {
  const t = useMessages()
  const queryClient = useQueryClient()
  const feedRefresh = useFeedRefresh()
  const { scrolled, onScroll } = useScrolled()
  const searchButtonRef = useRef<HTMLButtonElement>(null)
  const feedIds = props.feeds.map((feed) => feed.id)
  const tagIds = props.tags.map((tag) => tag.id)

  /**
   * タグのnullは「未分類」を指す
   * 未読だけ表示する設定の場合も、現在表示しているフィードは未読が0になっても残す
   * 記事を開いたら既読になる機能と組み合わせると、開いた瞬間にフィードが一覧から消えてしまうため
   */
  function sectionFeeds(tagId: number | null): Feed[] {
    const members =
      tagId === null
        ? props.feeds.filter((feed) => feed.tags.length === 0)
        : props.feeds.filter((feed) => feed.tags.some((tag) => tag.id === tagId))
    if (!props.unreadOnly) {
      return members
    }
    return members.filter(
      (feed) => feed.unread_count > 0 || sameSource(props.source, feedSource(feed)),
    )
  }
  const uncategorized = sectionFeeds(null)

  async function persist(save: Promise<void>) {
    await save
    await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
  }

  async function moveFeed(data: FeedDragData, target: FeedDropTarget) {
    const feed = props.feeds.find((item) => item.id === data.feedId)
    if (!feed) {
      return
    }
    if (data.fromTagId !== target.tagId) {
      await updateFeed(feed.id, {
        tag_ids: replaceFeedTag(
          feed.tags.map((tag) => tag.id),
          data.fromTagId,
          target.tagId,
        ),
      })
    }
    const before =
      target.beforeFeedId ?? sectionFeeds(target.tagId).find((item) => item.id !== feed.id)?.id
    if (before !== undefined) {
      await reorderFeeds(insertBefore(feedIds, feed.id, before))
    }
  }

  const feedDrag = useFeedDrag((data, target) => void persist(moveFeed(data, target)))
  const tagDrag = useReorderDrag('tag', tagIds, (ids) => void persist(reorderTags(ids)))

  function sourceRow(
    source: Source,
    children: ReactNode,
    options?: { search?: ReaderSearch; current?: boolean },
  ) {
    const search = options?.search ?? props.search
    const active = options?.current ?? sameSource(props.source, source)
    return (
      <Link
        {...sourceLink(source, search)}
        activeOptions={{ exact: true, includeSearch: true }}
        data-source-current={active ? 'true' : undefined}
        className={cn(rowClassName, active && 'bg-state-pressed hover:bg-state-pressed')}
        aria-current={active ? 'page' : undefined}
        onClick={props.onNavigate}
      >
        {children}
      </Link>
    )
  }

  function feedRow(feed: Feed, tagId: number | null) {
    const title = feedTitle(feed)
    const gone = feed.disabled === 1 && feed.disabled_reason === 'gone'
    const refreshing = feedRefresh.isRefreshing(feed.id)
    const row = sourceRow(
      feedSource(feed),
      <>
        <FeedIcon title={title} iconUrl={feed.icon_url} />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {refreshing ? (
          <LoaderCircle
            className="h-3.5 w-3.5 shrink-0 animate-spin text-fg-muted"
            aria-label={t.common.refreshing}
          />
        ) : gone ? (
          <span className="text-xs text-danger-text">{t.sidebar.gone}</span>
        ) : feed.last_error_kind ? (
          <AppTooltip label={errorKindLabel(feed.last_error_kind)}>
            <AlertTriangle
              className="h-4 w-4 text-danger-text"
              aria-label={errorKindLabel(feed.last_error_kind)}
            />
          </AppTooltip>
        ) : null}
        <UnreadBadge count={feed.unread_count} />
      </>,
    )
    return (
      <li
        key={feed.id}
        {...(props.readOnly ? {} : feedDrag.rowProps(feed.id, tagId))}
        className="relative flex min-h-8 items-center gap-2 rounded-md"
      >
        {!props.readOnly && feedDrag.isOver({ tagId, beforeFeedId: feed.id }) ? (
          <DropIndicator />
        ) : null}
        {props.readOnly ? (
          <div className="flex min-h-8 min-w-0 flex-1 items-center">{row}</div>
        ) : (
          <AppContextMenu
            menu={
              <FeedContextItems
                feed={feed}
                feeds={props.feeds}
                onEdit={() => props.onEditFeed(feed)}
                onUnsubscribe={() => props.onUnsubscribe(feed)}
              />
            }
          >
            <ContextMenuTrigger className="flex min-h-8 min-w-0 flex-1 items-center">
              {row}
            </ContextMenuTrigger>
          </AppContextMenu>
        )}
      </li>
    )
  }

  return (
    <nav aria-label={t.common.feeds} className="flex h-full min-h-0 w-full flex-col bg-shell">
      <ColumnHeader scrolled={scrolled} className="relative bg-shell">
        <IconButton ref={searchButtonRef} label={t.common.search} onClick={props.onSearchOpen}>
          <Search className="h-4 w-4" />
        </IconButton>
        {props.searchOpen ? (
          <SearchField
            initialQuery={props.searchQuery}
            onClose={props.onSearchClose}
            onEscape={() => {
              props.onSearchClose()
              searchButtonRef.current?.focus()
            }}
            onSubmit={props.onSearchSubmit}
          />
        ) : null}
        <div className="min-w-0 flex-1" />
        {props.readOnly ? (
          <IconButton label={t.sidebar.addMenu} onClick={props.onAddLocked}>
            <Plus className="h-4 w-4" />
          </IconButton>
        ) : (
          <DropdownMenu label={t.sidebar.addMenu} trigger={<Plus className="h-4 w-4" />}>
            <DropdownItem onClick={props.onAddFeed}>{t.sidebar.addFeed}</DropdownItem>
            <DropdownItem onClick={props.onCreateTag}>{t.sidebar.createTag}</DropdownItem>
          </DropdownMenu>
        )}
        <IconLink
          label={t.common.settings}
          to="/settings/$tab"
          params={{ tab: DEFAULT_SETTINGS_TAB }}
        >
          <Settings className="h-4 w-4" />
        </IconLink>
      </ColumnHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-3" onScroll={onScroll}>
        <div className="flex flex-col">
          {sourceRow({ kind: 'all' }, <span>{t.sidebar.allArticles}</span>, {
            search: orderOnlySearch(props.search),
          })}
          {sourceRow(
            { kind: 'unread' },
            <>
              <span>{t.sidebar.unread}</span>
              <UnreadBadge
                count={props.unreadCount}
                label={t.sidebar.unreadCountShort(props.unreadCount)}
              />
            </>,
            { search: orderOnlySearch(props.search) },
          )}
          {sourceRow({ kind: 'bookmarks' }, <span>{t.sidebar.bookmarked}</span>, {
            search: orderOnlySearch(props.search),
          })}
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {props.tags.map((tag) => {
            const members = sectionFeeds(tag.id)
            if (
              props.unreadOnly &&
              members.length === 0 &&
              !feedDrag.dragging &&
              !sameSource(props.source, tagSource(tag))
            ) {
              return null
            }
            return (
              <li
                key={tag.id}
                {...(props.readOnly ? {} : tagDrag.rowProps(tag.id))}
                className="relative"
              >
                {!props.readOnly && tagDrag.dropTarget === tag.id ? <DropIndicator /> : null}
                <div
                  className="relative"
                  {...(props.readOnly ? {} : feedDrag.sectionProps(tag.id))}
                >
                  {!props.readOnly && feedDrag.isOver({ tagId: tag.id, beforeFeedId: null }) ? (
                    <DropIndicator edge="bottom" />
                  ) : null}
                  {sourceRow(
                    tagSource(tag),
                    <span className="min-w-0 flex-1 truncate">{tag.name}</span>,
                  )}
                </div>
                <ul>{members.map((feed) => feedRow(feed, tag.id))}</ul>
              </li>
            )
          })}
          {uncategorized.length > 0 || (!props.readOnly && feedDrag.dragging) ? (
            <li>
              <div
                className="relative flex min-h-8 items-center px-2 text-sm text-fg-muted"
                {...(props.readOnly ? {} : feedDrag.sectionProps(null))}
              >
                {!props.readOnly && feedDrag.isOver({ tagId: null, beforeFeedId: null }) ? (
                  <DropIndicator edge="bottom" />
                ) : null}
                {t.sidebar.uncategorized}
              </div>
              <ul>{uncategorized.map((feed) => feedRow(feed, null))}</ul>
            </li>
          ) : null}
        </ul>
        {props.feeds.length === 0 ? (
          <div className="mt-4 px-2 text-center">
            <p className="text-sm text-fg-muted">{t.sidebar.emptyFeeds}</p>
            {props.readOnly ? null : (
              <Button className="mt-3" size="sm" onClick={props.onAddFeed}>
                {t.sidebar.addFeed}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </nav>
  )
}
