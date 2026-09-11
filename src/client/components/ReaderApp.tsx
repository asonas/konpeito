import { useNavigate } from '@tanstack/react-router'
import { CheckCheck, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Filter, SortOrder } from '../../shared/constants.ts'
import { feedTitle } from '../../shared/feed.ts'
import { DemoNoticeDialog } from '../features/demo/DemoNoticeDialog.tsx'
import { AddFeedDialog } from '../features/feeds/AddFeedDialog.tsx'
import { EditFeedDialog } from '../features/feeds/EditFeedDialog.tsx'
import { ShortcutsDialog } from '../features/search/ShortcutsDialog.tsx'
import { TagNameDialog } from '../features/tags/TagNameDialog.tsx'
import { useMessages } from '../i18n/I18nProvider.tsx'
import { ConfirmMutationDialog } from '../lib/confirm-mutation.tsx'
import { useFeedRefresh } from '../lib/feed-refresh.tsx'
import { resolveFirstItemOpen } from '../lib/first-item-open.ts'
import { useFullContent } from '../lib/full-content.ts'
import { type HotkeyHandlers, useHotkeys } from '../lib/hotkeys.ts'
import { useItemMutations } from '../lib/item-mutations.ts'
import { itemLink, type ReaderHref, sourceLink } from '../lib/links.ts'
import { useNotify } from '../lib/notify.ts'
import {
  type Bootstrap,
  deleteTag,
  type Feed,
  type ItemSummary,
  type Tag,
  unsubscribeFeed,
} from '../lib/queries.ts'
import { useReaderLayout } from '../lib/reader-layout.ts'
import { itemMatches, itemRefOf } from '../lib/refs.ts'
import { readerSearchOf, type Source, streamFromView } from '../lib/search-params.ts'
import { sourceIdentity } from '../lib/sources.ts'
import { usePrefetchItem, useStreamItems } from '../lib/stream-items.ts'
import { ItemList } from './item-list/ItemList.tsx'
import { ItemView } from './item-view/ItemView.tsx'
import { DemoNotice } from './layout/DemoNotice.tsx'
import { ReaderShell } from './layout/ReaderShell.tsx'
import { Sidebar } from './sidebar/Sidebar.tsx'
import { ConfirmDialog } from './ui/alert-dialog.tsx'
import { useAnyDialogOpen } from './ui/dialog.tsx'

type ReaderDialog =
  | { kind: 'add-feed' }
  | { kind: 'create-tag' }
  | { kind: 'shortcuts' }
  | { kind: 'edit-feed'; feed: Feed }
  | { kind: 'unsubscribe'; feed: Feed }
  | { kind: 'rename-tag'; tag: Tag }
  | { kind: 'delete-tag'; tag: Tag }
  | { kind: 'demo-lock' }

export function ReaderApp(props: {
  source: Source
  filter: Filter | undefined
  order: SortOrder | undefined
  itemRef: string | undefined
  bootstrap: Bootstrap
}) {
  const navigate = useNavigate()
  const notify = useNotify()
  const t = useMessages()
  const shell = useReaderLayout()
  const dialogOpen = useAnyDialogOpen()
  const [dialog, setDialog] = useState<ReaderDialog | null>(null)
  const [confirmMarkAll, setConfirmMarkAll] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)
  const sidebarRef = useRef<HTMLDivElement | null>(null)
  const listScrollTop = useRef(0)
  const autoMarkedRef = useRef<string | undefined>(undefined)
  const firstItemInitialized = useRef(false)
  const openedSourceKey = useRef<string | undefined>(undefined)
  const handledSourcePick = useRef(0)
  const [sourcePick, setSourcePick] = useState(0)
  const [lastSelectedRef, setLastSelectedRef] = useState<string | undefined>(props.itemRef)

  const settings = props.bootstrap.settings
  const readOnly = props.bootstrap.demo
  const order = props.order ?? settings.default_sort
  const search = readerSearchOf(
    props.filter,
    props.order,
    props.source.kind === 'search' ? props.source.q : undefined,
    settings.default_sort,
  )
  const plainSearch = readerSearchOf(undefined, props.order, undefined, settings.default_sort)
  const stream = useStreamItems(props.source, props.filter, order)
  const items = stream.items
  const mutations = useItemMutations()
  const fullContent = useFullContent(props.itemRef, props.bootstrap.feeds)
  const feedRefresh = useFeedRefresh()
  const pendingFullRef = useRef<string | undefined>(undefined)

  const firstRef = items[0] ? itemRefOf(items[0]) : undefined
  const selectedRef = props.itemRef ?? lastSelectedRef ?? firstRef
  const selectedIndex = items.findIndex((item) => itemMatches(item, selectedRef))
  const selected = selectedIndex >= 0 ? items[selectedIndex] : undefined
  const nextItem = selectedIndex >= 0 ? items[selectedIndex + 1] : undefined
  usePrefetchItem(nextItem)

  useEffect(() => {
    if (props.itemRef !== undefined) {
      setLastSelectedRef(props.itemRef)
    }
  }, [props.itemRef])

  const sourceKey = sourceIdentity(props.source)
  useEffect(() => {
    const first = items[0]
    const sourceChanged = openedSourceKey.current !== sourceKey
    const forced = sourcePick !== handledSourcePick.current
    const decision = resolveFirstItemOpen({
      initialized: firstItemInitialized.current,
      sourceChanged,
      forced,
      isLoading: stream.isLoading,
      hasFirstItem: first !== undefined,
      itemAlreadyInList:
        props.itemRef !== undefined && items.some((item) => itemMatches(item, props.itemRef)),
      itemRefSet: props.itemRef !== undefined,
      layout: shell.layout,
    })
    if (decision === 'wait') {
      return
    }
    const wasInitialized = firstItemInitialized.current
    firstItemInitialized.current = true
    handledSourcePick.current = sourcePick
    openedSourceKey.current = sourceKey
    if (wasInitialized && sourceChanged) {
      setLastSelectedRef(undefined)
    }
    if (decision === 'ignore' || first === undefined) {
      return
    }
    const firstItemRef = itemRefOf(first)
    if (decision === 'select') {
      setLastSelectedRef(firstItemRef)
      return
    }
    void navigate({
      ...itemLink(props.source, firstItemRef, search),
      replace: true,
    })
  }, [
    items,
    navigate,
    props.itemRef,
    props.source,
    search,
    shell.layout,
    sourceKey,
    sourcePick,
    stream.isLoading,
  ])

  const listVisible = shell.layout !== 'one' || props.itemRef === undefined
  useEffect(() => {
    if (listVisible && listScrollRef.current) {
      listScrollRef.current.scrollTop = listScrollTop.current
    }
  }, [listVisible])

  useEffect(() => {
    if (props.itemRef === undefined) {
      autoMarkedRef.current = undefined
      return
    }
    if (!settings.auto_mark_read || autoMarkedRef.current === props.itemRef) {
      return
    }
    const item = items.find((entry) => itemMatches(entry, props.itemRef))
    if (!item) {
      return
    }
    // 開いた記事は既読でも処理済みにしないと、未読へ戻した直後に再び既読の状態になる
    autoMarkedRef.current = props.itemRef
    if (!item.is_read) {
      mutations.setRead([item.id], true)
    }
  }, [items, props.itemRef, mutations, settings.auto_mark_read])

  const requestShowFull = fullContent.requestShow
  useEffect(() => {
    if (pendingFullRef.current === undefined || pendingFullRef.current !== props.itemRef) {
      return
    }
    pendingFullRef.current = undefined
    requestShowFull()
  }, [props.itemRef, requestShowFull])

  function go(href: ReaderHref) {
    void navigate(href)
    if (shell.layout !== 'three') {
      shell.closeDrawer()
    }
  }

  function toggleRead(item: { id: number; is_read: boolean }) {
    const next = !item.is_read
    mutations.setRead([item.id], next)
    notify(next ? t.article.markedRead : t.article.markedUnread)
  }

  function toggleBookmark(item: { id: number; is_bookmarked: boolean }) {
    if (readOnly) {
      setDialog({ kind: 'demo-lock' })
      return
    }
    const next = !item.is_bookmarked
    mutations.setBookmarked([item.id], next)
    notify(next ? t.article.bookmarked : t.article.unbookmarked)
  }

  function selectItem(item: ItemSummary, open: boolean) {
    const ref = itemRefOf(item)
    go(itemLink(props.source, ref, search))
    window.setTimeout(() => {
      if (open) {
        articleRef.current?.focus()
        return
      }
      const row = listScrollRef.current?.querySelector(`[data-item-id="${ref}"]`)
      if (row instanceof HTMLElement) {
        row.focus()
      }
    }, 0)
  }

  function move(delta: number, open: boolean) {
    if (items.length === 0) {
      return
    }
    const index = selectedIndex < 0 ? 0 : selectedIndex + delta
    const next = items[Math.min(Math.max(index, 0), items.length - 1)]
    if (next) {
      selectItem(next, open)
    }
  }

  function closeItem() {
    go(sourceLink(props.source, search))
  }

  async function markVisibleRead() {
    const body: Parameters<typeof mutations.markAllRead>[0] = {
      stream: streamFromView(props.source, props.filter),
      before: Math.floor(Date.now() / 1000),
    }
    if (props.source.kind === 'feed') {
      body.feed_id = props.source.feedId
    }
    if (props.source.kind === 'tag') {
      body.tag_id = props.source.tagId
    }
    await mutations.markAllRead(
      body,
      items.map((item) => item.id),
    )
    notify(t.article.markedAllRead)
  }

  function focusColumn(direction: -1 | 1) {
    const sidebarEl =
      sidebarRef.current?.querySelector<HTMLElement>('[data-source-current="true"]') ??
      sidebarRef.current?.querySelector<HTMLElement>('a')
    const listEl =
      selectedRef !== undefined
        ? listScrollRef.current?.querySelector<HTMLElement>(`[data-item-id="${selectedRef}"]`)
        : null
    const columns = [sidebarEl, listEl, articleRef.current]
    const active = document.activeElement
    let index = columns.findIndex((el) => el && (el === active || el.contains(active)))
    if (index < 0) {
      index = 1
    }
    const target = columns[Math.min(Math.max(index + direction, 0), columns.length - 1)]
    target?.focus()
  }

  const handlers: HotkeyHandlers = {
    nextAndOpen: () => move(1, true),
    prevAndOpen: () => move(-1, true),
    selectNext: () => move(1, false),
    selectPrev: () => move(-1, false),
    toggleOpen: () => {
      if (props.itemRef !== undefined) {
        closeItem()
      } else if (selected) {
        selectItem(selected, true)
      }
    },
    openOriginal: () => {
      if (selected?.url) {
        window.open(selected.url, '_blank', 'noopener,noreferrer')
      }
    },
    toggleRead: () => {
      if (selected) {
        toggleRead(selected)
      }
    },
    toggleBookmark: () => {
      if (selected) {
        toggleBookmark(selected)
      }
    },
    toggleFullContent: () => fullContent.toggle(),
    markAllRead: () => void markVisibleRead(),
    refreshFeed: () => {
      const feedId = props.source.kind === 'feed' ? props.source.feedId : selected?.feed_id
      const feed =
        feedId === undefined
          ? undefined
          : props.bootstrap.feeds.find((entry) => entry.id === feedId)
      if (feed !== undefined) {
        void feedRefresh.refresh(feed)
      }
    },
    focusSearch: () => {
      if (!shell.sidebarVisible) {
        shell.openSidebar()
      }
      setSearchOpen(true)
    },
    goUnread: () => go(sourceLink({ kind: 'unread' }, plainSearch)),
    goBookmarks: () => go(sourceLink({ kind: 'bookmarks' }, plainSearch)),
    goAll: () => go(sourceLink({ kind: 'all' }, plainSearch)),
    focusPrevColumn: () => focusColumn(-1),
    focusNextColumn: () => focusColumn(1),
    openShortcuts: () => setDialog({ kind: 'shortcuts' }),
    escape: () => {
      if (shell.layout !== 'three' && shell.drawerOpen) {
        shell.closeDrawer()
        return
      }
      if (props.itemRef !== undefined) {
        closeItem()
      }
    },
  }
  useHotkeys(handlers, !dialogOpen, readOnly)

  const closeDialog = () => setDialog(null)
  const onDialogOpenChange = (open: boolean) => {
    if (!open) {
      closeDialog()
    }
  }
  const drawer = shell.layout !== 'three'

  function renderDialog() {
    if (dialog === null) {
      return null
    }
    if (readOnly && dialog.kind !== 'shortcuts' && dialog.kind !== 'demo-lock') {
      return null
    }
    switch (dialog.kind) {
      case 'shortcuts':
        return <ShortcutsDialog open onOpenChange={onDialogOpenChange} readOnly={readOnly} />
      case 'demo-lock':
        return <DemoNoticeDialog open onOpenChange={onDialogOpenChange} />
      case 'add-feed':
        return (
          <AddFeedDialog
            open
            onOpenChange={onDialogOpenChange}
            feeds={props.bootstrap.feeds}
            tags={props.bootstrap.tags}
          />
        )
      case 'create-tag':
        return <TagNameDialog open tag={null} onOpenChange={onDialogOpenChange} />
      case 'rename-tag':
        return <TagNameDialog open tag={dialog.tag} onOpenChange={onDialogOpenChange} />
      case 'delete-tag':
        return (
          <ConfirmMutationDialog
            open
            onOpenChange={onDialogOpenChange}
            title={t.tagDialog.deleteTitle}
            description={t.tagDialog.deleteBody(dialog.tag.name)}
            confirmLabel={t.common.delete}
            icon={Trash2}
            mutate={() => deleteTag(dialog.tag.id)}
            succeeded={t.tagDialog.deleted}
            failed={t.tagDialog.deleteFailed}
            onDone={() => {
              if (props.source.kind === 'tag' && props.source.tagId === dialog.tag.id) {
                go(sourceLink({ kind: 'all' }, search))
              }
            }}
          />
        )
      case 'edit-feed':
        return (
          <EditFeedDialog
            open
            feed={dialog.feed}
            tags={props.bootstrap.tags}
            onOpenChange={onDialogOpenChange}
            onUnsubscribe={() => setDialog({ kind: 'unsubscribe', feed: dialog.feed })}
          />
        )
      case 'unsubscribe':
        return (
          <ConfirmMutationDialog
            open
            onOpenChange={onDialogOpenChange}
            title={t.feedDialog.unsubscribeTitle}
            description={t.feedDialog.unsubscribeBody(feedTitle(dialog.feed))}
            confirmLabel={t.feedDialog.unsubscribeConfirm}
            icon={Trash2}
            mutate={() => unsubscribeFeed(dialog.feed.id)}
            succeeded={t.feedDialog.unsubscribed}
            failed={t.feedDialog.unsubscribeFailed}
            onDone={() => {
              if (props.source.kind === 'feed' && props.source.feedId === dialog.feed.id) {
                go(sourceLink({ kind: 'all' }, search))
              }
            }}
          />
        )
    }
  }

  return (
    <>
      <ReaderShell
        layout={shell.layout}
        sidebarVisible={shell.sidebarVisible}
        listVisible={listVisible}
        articleVisible={shell.layout !== 'one' || props.itemRef !== undefined}
        drawerOpen={shell.drawerOpen}
        canDockSidebar={shell.canDockSidebar}
        onDrawerClose={shell.closeDrawer}
        onSidebarCollapse={shell.collapseSidebar}
        onSidebarDock={shell.dockSidebar}
        sidebar={
          <div ref={sidebarRef} className="h-full outline-none">
            <Sidebar
              feeds={props.bootstrap.feeds}
              tags={props.bootstrap.tags}
              unreadCount={props.bootstrap.unread_count}
              unreadOnly={settings.unread_only_feeds}
              source={props.source}
              search={search}
              searchOpen={searchOpen}
              searchQuery={props.source.kind === 'search' ? props.source.q : ''}
              onSearchOpen={() => setSearchOpen(true)}
              onSearchClose={() => setSearchOpen(false)}
              onSearchSubmit={(q) => {
                setSearchOpen(false)
                go(
                  sourceLink(
                    { kind: 'search', q },
                    readerSearchOf(props.filter, props.order, q, settings.default_sort),
                  ),
                )
              }}
              onAddFeed={() => setDialog({ kind: 'add-feed' })}
              onCreateTag={() => setDialog({ kind: 'create-tag' })}
              onAddLocked={() => setDialog({ kind: 'demo-lock' })}
              onEditFeed={(feed) => setDialog({ kind: 'edit-feed', feed })}
              onUnsubscribe={(feed) => setDialog({ kind: 'unsubscribe', feed })}
              readOnly={readOnly}
              onNavigate={() => {
                setSourcePick((count) => count + 1)
                if (drawer) {
                  shell.closeDrawer()
                }
              }}
            />
          </div>
        }
        list={
          <ItemList
            source={props.source}
            filter={props.filter}
            order={order}
            defaultOrder={settings.default_sort}
            search={search}
            settings={settings}
            feeds={props.bootstrap.feeds}
            tags={props.bootstrap.tags}
            stream={stream}
            selectedRef={selectedRef}
            scrollRef={listScrollRef}
            onScroll={(top) => {
              listScrollTop.current = top
            }}
            onSelect={selectItem}
            onMarkAllRead={() => setConfirmMarkAll(true)}
            {...(drawer ? { onOpenSidebar: shell.openSidebar } : {})}
            menu={{
              onEditFeed: (feed) => setDialog({ kind: 'edit-feed', feed }),
              onUnsubscribe: (feed) => setDialog({ kind: 'unsubscribe', feed }),
              onRenameTag: (tag) => setDialog({ kind: 'rename-tag', tag }),
              onDeleteTag: (tag) => setDialog({ kind: 'delete-tag', tag }),
            }}
            articleMenu={{
              fullContentShown: fullContent.shown,
              onToggleRead: toggleRead,
              onToggleBookmark: toggleBookmark,
              onToggleFullContent: (item) => {
                const ref = itemRefOf(item)
                if (props.itemRef === ref) {
                  fullContent.toggle()
                  return
                }
                pendingFullRef.current = ref
                selectItem(item, true)
              },
              onOpenOriginal: (item) => {
                if (item.url) {
                  window.open(item.url, '_blank', 'noopener,noreferrer')
                }
              },
            }}
            readOnly={readOnly}
          />
        }
        article={
          <ItemView
            key={props.itemRef ?? 'empty'}
            itemRef={props.itemRef}
            missing={props.source.kind === 'missing'}
            feeds={props.bootstrap.feeds}
            {...(shell.layout === 'one' && props.itemRef !== undefined
              ? { backLink: sourceLink(props.source, search) }
              : {})}
            articleRef={articleRef}
            onToggleRead={toggleRead}
            onToggleBookmark={toggleBookmark}
            fullContent={fullContent}
            hasNext={nextItem !== undefined}
            onNext={() => {
              if (!readOnly) {
                const current = items.find((entry) => itemMatches(entry, props.itemRef))
                if (current && !current.is_read) {
                  mutations.setRead([current.id], true)
                }
              }
              if (nextItem) {
                selectItem(nextItem, true)
              }
            }}
          />
        }
      />
      {renderDialog()}
      {readOnly ? null : (
        <ConfirmDialog
          open={confirmMarkAll}
          onOpenChange={setConfirmMarkAll}
          title={t.article.markAllConfirmTitle}
          description={t.article.markAllConfirmBody}
          confirmLabel={t.article.markRead}
          confirmVariant="default"
          icon={CheckCheck}
          onConfirm={async () => {
            await markVisibleRead()
            setConfirmMarkAll(false)
          }}
        />
      )}
      {readOnly ? <DemoNotice /> : null}
    </>
  )
}
