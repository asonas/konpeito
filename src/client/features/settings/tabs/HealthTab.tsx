import { useQuery } from '@tanstack/react-query'
import { feedTitle } from '../../../../shared/feed.ts'
import { Button } from '../../../components/ui/button.tsx'
import { useMessages } from '../../../i18n/I18nProvider.tsx'
import { useFeedRefresh } from '../../../lib/feed-refresh.tsx'
import { errorKindLabel } from '../../../lib/format.ts'
import { useNotify } from '../../../lib/notify.ts'
import { fetchHealth, queryKeys } from '../../../lib/queries.ts'

import { SettingsList, SettingsListItem, SettingsPanel } from '../SettingsPanel.tsx'

export function HealthTab() {
  const t = useMessages()
  const notify = useNotify()
  const feedRefresh = useFeedRefresh()
  const query = useQuery({ queryKey: queryKeys.health, queryFn: fetchHealth })
  const feeds = query.data?.feeds ?? []

  return (
    <SettingsPanel title={t.settings.health.title}>
      <SettingsList
        count={feeds.length}
        empty={query.data ? t.settings.health.empty : t.common.loading}
      >
        {feeds.map((feed) => (
          <SettingsListItem
            key={feed.id}
            actions={
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void feedRefresh.refresh(feed).then(() => notify(t.settings.health.refreshQueued))
                }
              >
                {t.common.refresh}
              </Button>
            }
          >
            <div className="truncate font-medium">{feedTitle(feed)}</div>
            <div className="truncate text-fg-muted">{feed.feed_url}</div>
            <div className="mt-1 text-danger-text">
              {feed.disabled === 1
                ? t.settings.health.disabled(feed.disabled_reason ?? '')
                : errorKindLabel(feed.last_error_kind, t)}
            </div>
            {feed.last_error ? (
              <div className="text-xs break-all text-fg-muted">{feed.last_error}</div>
            ) : null}
          </SettingsListItem>
        ))}
      </SettingsList>
    </SettingsPanel>
  )
}
