import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { feedTitle } from '../../../shared/feed.ts'
import { useAnnounce } from '../../components/LiveRegion.tsx'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { CheckboxField } from '../../components/ui/checkbox.tsx'
import { AppDialog } from '../../components/ui/dialog.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Field, Label } from '../../components/ui/label.tsx'
import type { Messages } from '../../i18n/en.ts'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { normalizeFeedInput } from '../../lib/feed-url.ts'
import { formatDate } from '../../lib/format.ts'
import { ApiError, errorMessage } from '../../lib/http.ts'
import { useNotify } from '../../lib/notify.ts'
import {
  type DiscoverCandidate,
  discoverFeeds,
  type Feed,
  queryKeys,
  subscribeFeed,
  type Tag,
} from '../../lib/queries.ts'

import { cn } from '../../lib/utils.ts'
import { TagPicker } from './TagPicker.tsx'

/** フィードの種類を示す単語は翻訳しない */
const FORMAT_LABELS: Record<string, string> = {
  rss: 'RSS',
  rdf: 'RDF',
  atom: 'Atom',
  jsonfeed: 'JSON Feed',
}

function candidateMeta(candidate: DiscoverCandidate, t: Messages): string {
  const parts: string[] = []
  const format = candidate.format === null ? undefined : FORMAT_LABELS[candidate.format]
  if (format !== undefined) {
    parts.push(format)
  }
  if (candidate.itemCount > 0) {
    parts.push(t.feedDialog.itemCount(candidate.itemCount))
  }
  if (candidate.latestItemAt !== null) {
    parts.push(t.feedDialog.latestItem(formatDate(candidate.latestItemAt)))
  }
  return parts.join(' · ')
}

export function AddFeedDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  feeds: Feed[]
  tags: Tag[]
}) {
  const t = useMessages()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const announce = useAnnounce()
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState<'idle' | 'finding' | 'adding'>('idle')
  const [candidates, setCandidates] = useState<DiscoverCandidate[]>([])
  const [selectedUrls, setSelectedUrls] = useState<string[]>([])
  const [addedUrls, setAddedUrls] = useState<string[]>([])
  const [tagIds, setTagIds] = useState<number[]>([])
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const busy = phase !== 'idle'
  const selectable = candidates.filter(
    (candidate) => candidate.subscribedFeedId === null && !addedUrls.includes(candidate.url),
  )
  const pending = selectedUrls.filter((target) => !addedUrls.includes(target))

  function clearResults() {
    setCandidates([])
    setSelectedUrls([])
    setAddedUrls([])
    setRowErrors({})
    setError(null)
  }

  function discoverErrorText(caught: unknown): string {
    if (caught instanceof ApiError && caught.errorKind !== null) {
      return t.feedDialog.discoverFailure(caught.errorKind, caught.status)
    }
    return errorMessage(caught, t.feedDialog.notFound)
  }

  async function discover() {
    const target = normalizeFeedInput(url)
    if (target === null) {
      clearResults()
      setError(t.feedDialog.invalidUrl)
      return
    }
    setUrl(target)
    clearResults()
    setPhase('finding')
    try {
      const result = await discoverFeeds(target)
      setCandidates(result.candidates)
      announce(t.feedDialog.foundCount(result.candidates.length))
    } catch (caught) {
      const message = discoverErrorText(caught)
      setError(message)
      announce(message)
    } finally {
      setPhase('idle')
    }
  }

  async function addSelected() {
    if (pending.length === 0) {
      return
    }
    setPhase('adding')
    const errors: Record<string, string> = {}
    const added: string[] = []
    try {
      for (const target of pending) {
        const candidate = candidates.find((entry) => entry.url === target)
        try {
          await subscribeFeed({
            url: target,
            title: candidate?.title ?? null,
            tagIds,
            skipDiscovery: true,
          })
          added.push(target)
        } catch (caught) {
          errors[target] = errorMessage(caught, t.feedDialog.addFailed)
        }
      }
      setRowErrors(errors)
      setAddedUrls((current) => [...current, ...added])
      if (added.length > 0) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
      }
      if (added.length > 0 && Object.keys(errors).length === 0) {
        notify(added.length === 1 ? t.feedDialog.added : t.feedDialog.addedCount(added.length))
        props.onOpenChange(false)
      }
    } finally {
      setPhase('idle')
    }
  }

  return (
    <AppDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t.feedDialog.addTitle}
      footer={
        <>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            disabled={busy || pending.length === 0}
            onClick={() => void addSelected()}
          >
            {phase === 'adding' ? t.feedDialog.adding : t.common.add}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void discover()
        }}
      >
        <Field>
          <Label htmlFor="add-feed-url">{t.feedDialog.urlLabel}</Label>
          <div className="flex gap-2">
            <Input
              id="add-feed-url"
              autoFocus
              value={url}
              onChange={(event) => {
                setUrl(event.target.value)
                if (candidates.length > 0 || error !== null) {
                  clearResults()
                }
              }}
              type="text"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://example.com"
            />
            <Button type="submit" variant="outline" disabled={busy}>
              {phase === 'finding'
                ? t.feedDialog.finding
                : candidates.length > 0
                  ? t.feedDialog.findAgain
                  : t.feedDialog.find}
            </Button>
          </div>
        </Field>
        {error !== null ? (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        ) : null}
        {candidates.length > 0 ? (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t.feedDialog.foundTitle}</legend>
            <ul className="flex flex-col gap-2">
              {candidates.map((candidate) => {
                const subscribed =
                  candidate.subscribedFeedId === null
                    ? undefined
                    : props.feeds.find((feed) => feed.id === candidate.subscribedFeedId)
                const done = addedUrls.includes(candidate.url)
                const locked = candidate.subscribedFeedId !== null || done
                const title =
                  subscribed === undefined
                    ? (candidate.title ?? candidate.url)
                    : feedTitle(subscribed)
                const meta = candidateMeta(candidate, t)
                const rowError = rowErrors[candidate.url]
                return (
                  <li
                    key={candidate.url}
                    className={cn(
                      'rounded-md border border-line p-3',
                      locked && 'bg-sunken text-fg-muted',
                    )}
                  >
                    <CheckboxField
                      checked={locked || selectedUrls.includes(candidate.url)}
                      disabled={locked || busy}
                      onCheckedChange={(next) => {
                        setSelectedUrls(
                          next
                            ? [...selectedUrls, candidate.url]
                            : selectedUrls.filter((item) => item !== candidate.url),
                        )
                      }}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{title}</span>
                        {candidate.subscribedFeedId !== null ? (
                          <Badge variant="outline" size="sm">
                            {t.feedDialog.subscribed}
                          </Badge>
                        ) : null}
                        {done ? (
                          <Badge variant="info" size="sm">
                            {t.feedDialog.addedRow}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="block break-all text-fg-muted">{candidate.url}</span>
                      {meta.length > 0 ? <span className="block text-fg-muted">{meta}</span> : null}
                    </CheckboxField>
                    {rowError ? <p className="mt-2 text-sm text-danger-text">{rowError}</p> : null}
                  </li>
                )
              })}
            </ul>
          </fieldset>
        ) : null}
        {selectable.length > 0 ? (
          <TagPicker tags={props.tags} selected={tagIds} onChange={setTagIds} />
        ) : null}
      </form>
    </AppDialog>
  )
}
