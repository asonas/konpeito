import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { feedTitle } from '../../../shared/feed.ts'
import { FeedIcon } from '../../components/FeedIcon.tsx'
import { Button, buttonVariants } from '../../components/ui/button.tsx'
import { CheckboxField } from '../../components/ui/checkbox.tsx'
import { AppDialog } from '../../components/ui/dialog.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Field, Label } from '../../components/ui/label.tsx'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { useFeedRefresh } from '../../lib/feed-refresh.tsx'
import { errorKindLabel, formatRelative } from '../../lib/format.ts'
import { errorMessage } from '../../lib/http.ts'
import { useNotify } from '../../lib/notify.ts'
import { type Feed, queryKeys, type Tag, updateFeed } from '../../lib/queries.ts'

import { TagPicker } from './TagPicker.tsx'

export function EditFeedDialog(props: {
  open: boolean
  feed: Feed
  tags: Tag[]
  onOpenChange: (open: boolean) => void
  onUnsubscribe: () => void
}) {
  const t = useMessages()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const feedRefresh = useFeedRefresh()
  const [title, setTitle] = useState(props.feed.custom_title ?? '')
  const [tagIds, setTagIds] = useState<number[]>(props.feed.tags.map((tag) => tag.id))
  const [fullContent, setFullContent] = useState(props.feed.fetch_full_content === 1)
  const [showLeadImage, setShowLeadImage] = useState(props.feed.show_lead_image !== 0)
  const [busy, setBusy] = useState(false)
  const formId = 'edit-feed'
  const trimmed = title.trim()
  const failing = props.feed.disabled === 1 || props.feed.last_error_kind !== null

  async function save() {
    setBusy(true)
    try {
      await updateFeed(props.feed.id, {
        custom_title: trimmed.length === 0 ? null : trimmed,
        tag_ids: tagIds,
        fetch_full_content: fullContent,
        show_lead_image: showLeadImage,
      })
      await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
      notify(t.feedDialog.saved)
      props.onOpenChange(false)
    } catch (error) {
      notify(errorMessage(error, t.common.saveFailed), 'destructive')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t.feedDialog.editTitle}
      footer={
        <>
          <Button
            variant="destructive-outline"
            className="sm:mr-auto"
            onClick={props.onUnsubscribe}
          >
            {t.feedDialog.unsubscribeConfirm}
          </Button>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form={formId} disabled={busy}>
            {busy ? t.common.saving : t.common.save}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className="flex flex-col gap-1 rounded-md border border-line p-3 text-sm">
          <div className="flex items-center gap-2">
            <FeedIcon title={feedTitle(props.feed)} iconUrl={props.feed.icon_url} />
            <span className="min-w-0 truncate font-medium">{feedTitle(props.feed)}</span>
          </div>
          <p className="break-all text-fg-muted">
            <span className="sr-only">{t.feedDialog.feedUrlLabel}: </span>
            {props.feed.feed_url}
          </p>
          {props.feed.last_fetch_at === null ? (
            <p className="text-fg-muted">{t.feedDialog.neverFetched}</p>
          ) : (
            <p className="flex gap-2">
              <span className="text-fg-muted">{t.feedDialog.lastFetchLabel}</span>
              <span>{formatRelative(props.feed.last_fetch_at)}</span>
            </p>
          )}
          {failing ? (
            <p className="text-danger-text">
              {props.feed.disabled === 1
                ? (props.feed.disabled_reason ?? errorKindLabel(props.feed.last_error_kind, t))
                : errorKindLabel(props.feed.last_error_kind, t)}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={feedRefresh.isRefreshing(props.feed.id)}
              onClick={() =>
                void feedRefresh.refresh(props.feed).then(() => notify(t.feedDialog.refreshQueued))
              }
            >
              {feedRefresh.isRefreshing(props.feed.id) ? t.common.refreshing : t.common.refresh}
            </Button>
            {props.feed.site_url === null ? null : (
              <a
                href={props.feed.site_url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                {t.feedDialog.openSite}
              </a>
            )}
          </div>
        </div>
        <Field>
          <Label htmlFor="edit-feed-title">{t.feedDialog.titleLabel}</Label>
          <Input
            id="edit-feed-title"
            value={title}
            placeholder={props.feed.title}
            aria-describedby="edit-feed-title-hint"
            onChange={(event) => setTitle(event.target.value)}
          />
          <p id="edit-feed-title-hint" className="text-sm text-fg-muted">
            {t.feedDialog.titleHint}
          </p>
        </Field>
        <TagPicker tags={props.tags} selected={tagIds} onChange={setTagIds} />
        <CheckboxField
          checked={fullContent}
          onCheckedChange={setFullContent}
          description={t.feedDialog.fullContentHint}
        >
          {t.feedDialog.fullContent}
        </CheckboxField>
        <CheckboxField
          checked={showLeadImage}
          onCheckedChange={setShowLeadImage}
          description={t.feedDialog.ogImageHint}
        >
          {t.feedDialog.ogImage}
        </CheckboxField>
      </form>
    </AppDialog>
  )
}
