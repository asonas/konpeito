import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { feedTitle } from '../../../../shared/feed.ts'
import { ConfirmDialog } from '../../../components/ui/alert-dialog.tsx'
import { Button, buttonVariants } from '../../../components/ui/button.tsx'
import { DropdownItem, DropdownMenu } from '../../../components/ui/dropdown.tsx'
import type { Messages } from '../../../i18n/en.ts'
import { useMessages } from '../../../i18n/I18nProvider.tsx'
import { formatBytes } from '../../../lib/format.ts'
import { errorMessage } from '../../../lib/http.ts'
import { useNotify } from '../../../lib/notify.ts'
import {
  fetchStorage,
  type PurgeQuery,
  purgeFeedItems,
  queryKeys,
  recomputeStorage,
  type StorageFeedRow,
} from '../../../lib/queries.ts'

import {
  SettingsList,
  SettingsListItem,
  SettingsPanel,
  SettingsSection,
} from '../SettingsPanel.tsx'

const WARN_RATIO = 0.8
const DANGER_RATIO = 0.95
const THIRTY_DAYS_SEC = 30 * 86400

interface PurgeAction {
  label: string
  describe: (title: string, count: number) => string
  query: () => PurgeQuery
}

function purgeActions(t: Messages): readonly PurgeAction[] {
  return [
    {
      label: t.settings.storage.purgeRead30,
      describe: t.settings.storage.purgeRead30Body,
      query: () => ({
        before: String(Math.floor(Date.now() / 1000) - THIRTY_DAYS_SEC),
        only_read: '1',
      }),
    },
    {
      label: t.settings.storage.purgeFull,
      describe: t.settings.storage.purgeFullBody,
      query: () => ({ full_content_only: '1' }),
    },
    {
      label: t.settings.storage.purgeOriginal,
      describe: t.settings.storage.purgeOriginalBody,
      query: () => ({ original_content_only: '1' }),
    },
    {
      label: t.settings.storage.purgeAll,
      describe: t.settings.storage.purgeAllBody,
      query: () => ({}),
    },
  ]
}

interface PendingPurge {
  feedId: number
  label: string
  description: string
  query: PurgeQuery
}

export function StorageTab() {
  const t = useMessages()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [pending, setPending] = useState<PendingPurge | null>(null)
  const [busy, setBusy] = useState(false)
  const query = useQuery({ queryKey: queryKeys.storage, queryFn: fetchStorage })
  const data = query.data
  const ratio = data?.ratio ?? 0
  const barColor =
    ratio >= DANGER_RATIO
      ? 'bg-danger-mark'
      : ratio >= WARN_RATIO
        ? 'bg-warning-mark'
        : 'bg-accent-mark'
  const largest = data?.feeds[0]?.approx_bytes ?? 1
  const feeds = data?.feeds ?? []
  const actions = purgeActions(t)

  async function recompute() {
    await recomputeStorage()
    await queryClient.invalidateQueries({ queryKey: queryKeys.storage })
    notify(t.settings.storage.recomputed)
  }

  async function confirmPurge() {
    if (!pending) {
      return
    }
    setBusy(true)
    try {
      await purgeFeedItems(pending.feedId, pending.query)
      await queryClient.invalidateQueries({ queryKey: queryKeys.storage })
      await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
      notify(t.settings.storage.deleted)
      setPending(null)
    } catch (error) {
      notify(errorMessage(error, t.settings.storage.deleteFailed), 'destructive')
    } finally {
      setBusy(false)
    }
  }

  function feedRow(row: StorageFeedRow) {
    const title = feedTitle(row)
    return (
      <SettingsListItem
        key={row.feed_id}
        actions={
          <DropdownMenu
            label={t.settings.storage.deleteMenu}
            trigger={t.settings.storage.deleteTrigger}
            triggerClassName={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {actions.map((action) => (
              <DropdownItem
                key={action.label}
                variant="danger"
                onClick={() =>
                  setPending({
                    feedId: row.feed_id,
                    label: action.label,
                    description: action.describe(title, row.item_count),
                    query: action.query(),
                  })
                }
              >
                {action.label}
              </DropdownItem>
            ))}
          </DropdownMenu>
        }
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{title}</span>
          <span className="shrink-0 text-fg-muted">
            {t.settings.storage.itemBytes(row.item_count, formatBytes(row.approx_bytes))}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded bg-sunken">
          <div
            className="h-full rounded bg-accent-mark"
            style={{ width: `${Math.min((row.approx_bytes / largest) * 100, 100)}%` }}
          />
        </div>
      </SettingsListItem>
    )
  }

  return (
    <SettingsPanel
      title={t.settings.storage.title}
      actions={
        <Button size="sm" variant="outline" onClick={() => void recompute()}>
          {t.settings.storage.recompute}
        </Button>
      }
    >
      <SettingsSection>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium">{t.settings.storage.usage}</span>
          <span className="text-fg-muted">
            {data
              ? `${formatBytes(data.used_bytes)} / ${formatBytes(data.limit_bytes)}`
              : t.common.loading}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-sunken">
          <div
            className={`h-full ${barColor}`}
            style={{ width: `${Math.min(ratio * 100, 100)}%` }}
          />
        </div>
      </SettingsSection>
      <SettingsSection
        title={t.settings.storage.perFeedTitle}
        description={t.settings.storage.perFeedDescription}
      >
        <SettingsList
          count={feeds.length}
          empty={data ? t.settings.storage.empty : t.common.loading}
        >
          {feeds.map(feedRow)}
        </SettingsList>
      </SettingsSection>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPending(null)
          }
        }}
        title={pending?.label ?? t.settings.storage.confirmTitle}
        description={pending?.description ?? ''}
        confirmLabel={pending?.label ?? t.common.delete}
        icon={Trash2}
        busy={busy}
        onConfirm={confirmPurge}
      />
    </SettingsPanel>
  )
}
