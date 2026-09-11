import type { Messages } from '../../i18n/en.ts'
import { getMessages } from '../../i18n/locale.ts'
import { ContextMenuItem } from '../ui/context-menu.tsx'

interface ArticleMenuLabels {
  readLabel: string
  bookmarkLabel: string
  fullContentLabel: string
  openOriginalLabel: string
  hasUrl: boolean
}

export function ArticleContextItems(
  props: ArticleMenuLabels & {
    onToggleRead: () => void
    onToggleBookmark: () => void
    onToggleFullContent: () => void
    onOpenOriginal: () => void
  },
) {
  return (
    <>
      <ContextMenuItem onClick={props.onToggleRead}>{props.readLabel}</ContextMenuItem>
      <ContextMenuItem onClick={props.onToggleBookmark}>{props.bookmarkLabel}</ContextMenuItem>
      {props.hasUrl ? (
        <>
          <ContextMenuItem onClick={props.onToggleFullContent}>
            {props.fullContentLabel}
          </ContextMenuItem>
          <ContextMenuItem onClick={props.onOpenOriginal}>
            {props.openOriginalLabel}
          </ContextMenuItem>
        </>
      ) : null}
    </>
  )
}

export function articleMenuLabels(
  input: {
    isRead: boolean
    isBookmarked: boolean
    fullContentShown: boolean
    hasUrl: boolean
  },
  messages: Messages = getMessages(),
): ArticleMenuLabels {
  return {
    readLabel: input.isRead ? messages.article.markUnread : messages.article.markRead,
    bookmarkLabel: input.isBookmarked ? messages.article.unbookmark : messages.article.bookmark,
    fullContentLabel: input.fullContentShown
      ? messages.article.showFeed
      : messages.article.showFull,
    openOriginalLabel: messages.article.openOriginal,
    hasUrl: input.hasUrl,
  }
}
