import { useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { useFeedRefresh } from '../../lib/feed-refresh.tsx'
import { moveToFront } from '../../lib/order.ts'
import { type Feed, queryKeys, reorderFeeds, reorderTags, type Tag } from '../../lib/queries.ts'
import { ContextMenuItem } from '../ui/context-menu.tsx'
import { DropdownItem, DropdownMenu } from '../ui/dropdown.tsx'

export interface SourceMenuHandlers {
  onEditFeed: (feed: Feed) => void
  onUnsubscribe: (feed: Feed) => void
  onRenameTag: (tag: Tag) => void
  onDeleteTag: (tag: Tag) => void
}

interface MenuItemProps {
  children: ReactNode
  onClick?: () => void
}

export function SourceMenu(
  props: {
    feed: Feed | undefined
    tag: Tag | undefined
    feeds: Feed[]
    tags: Tag[]
    readOnly: boolean
  } & SourceMenuHandlers,
) {
  const t = useMessages()
  const feed = props.feed
  const tag = props.tag
  if (props.readOnly || (!feed && !tag)) {
    return null
  }
  return (
    <DropdownMenu label={t.common.moreActions} trigger={<MoreHorizontal className="h-4 w-4" />}>
      {feed ? (
        <FeedActionItems
          Item={DropdownItem}
          feed={feed}
          feeds={props.feeds}
          onEdit={() => props.onEditFeed(feed)}
          onUnsubscribe={() => props.onUnsubscribe(feed)}
        />
      ) : null}
      {tag ? (
        <TagActionItems
          Item={DropdownItem}
          tag={tag}
          tags={props.tags}
          onRename={() => props.onRenameTag(tag)}
          onDelete={() => props.onDeleteTag(tag)}
        />
      ) : null}
    </DropdownMenu>
  )
}

function FeedActionItems(props: {
  Item: (itemProps: MenuItemProps) => ReactNode
  feed: Feed
  feeds: Feed[]
  onEdit: () => void
  onUnsubscribe: () => void
}) {
  const t = useMessages()
  const queryClient = useQueryClient()
  const feedRefresh = useFeedRefresh()
  const Item = props.Item

  async function moveFront() {
    await reorderFeeds(
      moveToFront(
        props.feeds.map((entry) => entry.id),
        props.feed.id,
      ),
    )
    await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
  }

  return (
    <>
      <Item onClick={props.onEdit}>{t.sourceMenu.editFeed}</Item>
      <Item onClick={() => void feedRefresh.refresh(props.feed)}>{t.sourceMenu.refresh}</Item>
      <Item onClick={() => void moveFront()}>{t.sourceMenu.moveToFront}</Item>
      <Item onClick={props.onUnsubscribe}>{t.sourceMenu.unsubscribe}</Item>
    </>
  )
}

export function FeedContextItems(props: {
  feed: Feed
  feeds: Feed[]
  onEdit: () => void
  onUnsubscribe: () => void
}) {
  return (
    <FeedActionItems
      Item={ContextMenuItem}
      feed={props.feed}
      feeds={props.feeds}
      onEdit={props.onEdit}
      onUnsubscribe={props.onUnsubscribe}
    />
  )
}

function TagActionItems(props: {
  Item: (itemProps: MenuItemProps) => ReactNode
  tag: Tag
  tags: Tag[]
  onRename: () => void
  onDelete: () => void
}) {
  const t = useMessages()
  const queryClient = useQueryClient()
  const Item = props.Item

  async function moveFront() {
    await reorderTags(
      moveToFront(
        props.tags.map((entry) => entry.id),
        props.tag.id,
      ),
    )
    await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
  }

  return (
    <>
      <Item onClick={props.onRename}>{t.sourceMenu.rename}</Item>
      <Item onClick={() => void moveFront()}>{t.sourceMenu.moveToFront}</Item>
      <Item onClick={props.onDelete}>{t.sourceMenu.delete}</Item>
    </>
  )
}
