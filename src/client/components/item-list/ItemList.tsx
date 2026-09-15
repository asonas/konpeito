import { Link } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Bookmark,
  CheckCheck,
  LoaderCircle,
  Menu,
} from 'lucide-react'
import { type RefObject, useEffect } from 'react'
import type { Filter, SortOrder } from '../../../shared/constants.ts'
import { feedTitle } from '../../../shared/feed.ts'
import type { Messages } from '../../i18n/en.ts'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { useFeedRefresh } from '../../lib/feed-refresh.tsx'
import { formatRelative } from '../../lib/format.ts'
import { itemLink, sourceLink } from '../../lib/links.ts'
import type { Feed, ItemSummary, Settings, Tag } from '../../lib/queries.ts'
import { itemMatches, itemRefOf } from '../../lib/refs.ts'
import { compactSearch, type ReaderSearch, type Source } from '../../lib/search-params.ts'
import { sourceHeading } from '../../lib/sources.ts'
import type { StreamItems } from '../../lib/stream-items.ts'
import { cn } from '../../lib/utils.ts'
import { FeedIcon } from '../FeedIcon.tsx'
import { ArticleContextItems, articleMenuLabels } from '../item-view/ArticleMenu.tsx'
import { Badge } from '../ui/badge.tsx'
import { ColumnHeader, useScrolled } from '../ui/column-header.tsx'
import { AppContextMenu, ContextMenuTrigger } from '../ui/context-menu.tsx'
import { IconButton, IconLink } from '../ui/icon-button.tsx'
import { SourceMenu, type SourceMenuHandlers } from './SourceMenu.tsx'

const ROW_ESTIMATE = 110
const PREFETCH_THRESHOLD = 5

function emptyMessage(source: Source, filter: Filter, t: Messages): string {
  if (source.kind === 'missing') {
    return t.common.notFound
  }
  if (source.kind === 'search') {
    return t.list.emptySearch(source.q)
  }
  if (source.kind === 'unread') {
    return t.list.emptyUnread
  }
  if (source.kind === 'bookmarks') {
    return t.list.emptyBookmarks
  }
  switch (filter) {
    case 'recently-read':
      return t.list.emptyRecentlyRead
    case 'updated':
      return t.list.emptyUpdated
    default:
      return t.list.emptyDefault
  }
}

export function ItemList(props: {
  source: Source
  filter: Filter | undefined
  order: SortOrder
  defaultOrder: SortOrder
  search: ReaderSearch
  settings: Settings
  feeds: Feed[]
  tags: Tag[]
  stream: StreamItems
  selectedRef: string | undefined
  scrollRef: RefObject<HTMLDivElement | null>
  onScroll: (top: number) => void
  onSelect: (item: ItemSummary, open: boolean) => void
  onMarkAllRead: () => void
  onOpenSidebar?: () => void
  menu: SourceMenuHandlers
  articleMenu: {
    fullContentShown: boolean
    onToggleRead: (item: ItemSummary) => void
    onToggleBookmark: (item: ItemSummary) => void
    onToggleFullContent: (item: ItemSummary) => void
    onOpenOriginal: (item: ItemSummary) => void
  }
  readOnly: boolean
}) {
  const t = useMessages()
  const { items, hasNextPage, isFetchingNextPage, fetchNextPage, isLoading } = props.stream
  const feedRefresh = useFeedRefresh()
  const filter = props.filter ?? 'all'
  const source = props.source
  const feedsById = new Map(props.feeds.map((feed) => [feed.id, feed]))
  const currentFeed = source.kind === 'feed' ? feedsById.get(source.feedId) : undefined
  const currentTag =
    source.kind === 'tag' ? props.tags.find((tag) => tag.id === source.tagId) : undefined
  const { scrolled, onScroll } = useScrolled(props.onScroll)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => props.scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 8,
    getItemKey: (index) => {
      const item = items[index]
      return item ? itemRefOf(item) : index
    },
  })

  const fetchThreshold = items.length - PREFETCH_THRESHOLD
  const endIndex = virtualizer.range?.endIndex ?? -1
  useEffect(() => {
    if (endIndex >= fetchThreshold && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [endIndex, fetchThreshold, hasNextPage, isFetchingNextPage, fetchNextPage])

  useEffect(() => {
    if (props.selectedRef === undefined) {
      return
    }
    const index = items.findIndex((item) => itemMatches(item, props.selectedRef))
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'auto' })
    }
  }, [items, props.selectedRef, virtualizer])

  const setSize = hasNextPage ? -1 : items.length
  const sortLabel = props.order === 'desc' ? t.list.newestFirst : t.list.oldestFirst
  const sortHref = sourceLink(
    source,
    compactSearch(
      { ...props.search, order: props.order === 'desc' ? 'asc' : 'desc' },
      props.defaultOrder,
    ),
    props.settings.home_unread,
  )

  return (
    <section
      aria-label={t.list.articleList}
      className="flex h-full w-full min-w-0 flex-col bg-canvas"
    >
      <ColumnHeader as="header" scrolled={scrolled} className="relative bg-canvas">
        <div className="flex min-w-0 flex-1 items-center">
          {props.onOpenSidebar ? (
            <IconButton label={t.common.feeds} onClick={props.onOpenSidebar}>
              <Menu className="h-4 w-4" />
            </IconButton>
          ) : null}
        </div>
        <IconLink label={sortLabel} {...sortHref}>
          {props.order === 'desc' ? (
            <ArrowDownWideNarrow className="h-4 w-4" />
          ) : (
            <ArrowUpWideNarrow className="h-4 w-4" />
          )}
        </IconLink>
        <IconButton label={t.list.markAllRead} onClick={props.onMarkAllRead}>
          <CheckCheck className="h-4 w-4" />
        </IconButton>
        <SourceMenu
          feed={currentFeed}
          tag={currentTag}
          feeds={props.feeds}
          tags={props.tags}
          readOnly={props.readOnly}
          {...props.menu}
        />
      </ColumnHeader>
      <div
        ref={props.scrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        onScroll={onScroll}
      >
        <h1 className="flex min-w-0 shrink-0 items-center gap-2 px-3 pt-3 pb-2 text-lg leading-snug font-semibold">
          <span className="line-clamp-2 min-w-0">
            {sourceHeading(source, props.feeds, props.tags, filter)}
          </span>
          {currentFeed !== undefined && feedRefresh.isRefreshing(currentFeed.id) ? (
            <LoaderCircle
              className="h-4 w-4 shrink-0 animate-spin text-fg-muted"
              aria-label={t.common.refreshing}
            />
          ) : null}
        </h1>
        <div
          role="feed"
          aria-label={t.list.articleList}
          aria-busy={isFetchingNextPage}
          className={cn(
            'relative w-full',
            items.length === 0 ? 'flex min-h-0 flex-1 items-center justify-center' : 'min-h-16',
          )}
          style={items.length === 0 ? undefined : { height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((row) => {
            const item = items[row.index]
            if (!item) {
              return null
            }
            const feed = feedsById.get(item.feed_id)
            return (
              <ItemRow
                key={row.key}
                item={item}
                index={row.index}
                start={row.start}
                setSize={setSize}
                selected={itemMatches(item, props.selectedRef)}
                feedName={feed ? feedTitle(feed) : ''}
                feedIconUrl={feed?.icon_url ?? null}
                href={itemLink(source, itemRefOf(item), props.search)}
                measure={virtualizer.measureElement}
                onFocus={() => {
                  if (row.index >= fetchThreshold && hasNextPage && !isFetchingNextPage) {
                    fetchNextPage()
                  }
                }}
                onOpen={() => props.onSelect(item, true)}
                onToggleRead={() => props.articleMenu.onToggleRead(item)}
                onToggleBookmark={() => props.articleMenu.onToggleBookmark(item)}
                onToggleFullContent={() => props.articleMenu.onToggleFullContent(item)}
                onOpenOriginal={() => props.articleMenu.onOpenOriginal(item)}
                fullContentShown={
                  itemMatches(item, props.selectedRef) && props.articleMenu.fullContentShown
                }
              />
            )
          })}
          {items.length === 0 && !isLoading ? (
            <article
              className="flex min-h-48 w-full items-center justify-center p-6 text-center text-sm text-fg-muted"
              aria-setsize={0}
              aria-posinset={1}
            >
              {emptyMessage(source, filter, t)}
            </article>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function ItemRow(props: {
  item: ItemSummary
  index: number
  start: number
  setSize: number
  selected: boolean
  feedName: string
  feedIconUrl: string | null
  href: ReturnType<typeof itemLink>
  measure: (node: HTMLElement | null) => void
  onFocus: () => void
  onOpen: () => void
  onToggleRead: () => void
  onToggleBookmark: () => void
  onToggleFullContent: () => void
  onOpenOriginal: () => void
  fullContentShown: boolean
}) {
  const t = useMessages()
  const { item, selected } = props
  const ref = itemRefOf(item)
  const titleId = `item-title-${ref}`
  const title = item.title || t.common.untitled
  const labels = articleMenuLabels(
    {
      isRead: item.is_read,
      isBookmarked: item.is_bookmarked,
      fullContentShown: props.fullContentShown,
      hasUrl: item.url !== null,
    },
    t,
  )
  const row = (
    <article
      data-index={props.index}
      data-item-id={ref}
      ref={props.measure}
      aria-labelledby={titleId}
      aria-posinset={props.index + 1}
      aria-setsize={props.setSize}
      aria-current={selected ? 'true' : undefined}
      tabIndex={selected ? 0 : -1}
      className={cn(
        'absolute top-0 left-0 w-full border-l-2 py-2 pr-3 pl-2.5',
        'after:pointer-events-none after:absolute after:right-3 after:bottom-0 after:left-2.5 after:h-px',
        selected
          ? cn(
              'border-l-accent-mark bg-accent-surface after:bg-transparent',
              // 選択中の行の上の罫線は直前の行が描く
              // 同じ位置に地の色の帯を重ねて隠し、青い面と灰色の罫線が接しないようにする
              'before:pointer-events-none before:absolute before:-top-px before:right-3 before:left-2.5 before:h-px before:bg-canvas',
            )
          : 'border-l-transparent bg-canvas after:bg-line',
      )}
      style={{ transform: `translateY(${props.start}px)` }}
      onFocus={props.onFocus}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          props.onOpen()
        }
      }}
    >
      <Link {...props.href} className="absolute inset-0 z-0" tabIndex={-1}>
        <span className="sr-only">{title}</span>
      </Link>
      <div className="pointer-events-none relative flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <div className="flex min-w-0 items-center gap-1">
              <FeedIcon title={props.feedName} iconUrl={props.feedIconUrl} />
              <span className="truncate">{props.feedName}</span>
            </div>
            {item.is_read ? null : (
              <span className="h-2 w-2 shrink-0 rounded-full bg-accent-mark" aria-hidden="true" />
            )}
            {item.has_update ? (
              <Badge variant="info" size="sm">
                {t.list.updated}
              </Badge>
            ) : null}
          </div>
          <h3
            id={titleId}
            className={cn(
              'mt-1 line-clamp-3 text-sm font-medium',
              item.is_read && !selected && 'text-fg-muted',
            )}
          >
            {title}
          </h3>
          {item.summary ? (
            <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{item.summary}</p>
          ) : null}
          <div className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
            <time dateTime={new Date(item.published_at * 1000).toISOString()}>
              {formatRelative(item.published_at)}
            </time>
          </div>
        </div>
        {item.lead_image_url ? (
          <img
            src={item.lead_image_url}
            alt=""
            className="relative h-14 w-[88px] shrink-0 rounded object-cover"
          />
        ) : null}
      </div>
      {item.is_bookmarked ? (
        <Bookmark className="absolute top-2 right-3 h-4 w-4 fill-current" aria-hidden="true" />
      ) : null}
    </article>
  )
  return (
    <AppContextMenu
      menu={
        <ArticleContextItems
          {...labels}
          onToggleRead={props.onToggleRead}
          onToggleBookmark={props.onToggleBookmark}
          onToggleFullContent={props.onToggleFullContent}
          onOpenOriginal={props.onOpenOriginal}
        />
      }
    >
      <ContextMenuTrigger className="contents">{row}</ContextMenuTrigger>
    </AppContextMenu>
  )
}
