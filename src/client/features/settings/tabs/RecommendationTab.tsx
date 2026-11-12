import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../../components/ui/button.tsx'
import { Label } from '../../../components/ui/label.tsx'
import { Textarea } from '../../../components/ui/textarea.tsx'
import { useMessages } from '../../../i18n/I18nProvider.tsx'
import { formatDateTime } from '../../../lib/format.ts'
import { useNotify } from '../../../lib/notify.ts'
import {
  fetchRecommendationStatus,
  queryKeys,
  type RecommendationStatus,
  savePreference,
} from '../../../lib/queries.ts'
import {
  SettingsList,
  SettingsListItem,
  SettingsPanel,
  SettingsSection,
} from '../SettingsPanel.tsx'

type Version = RecommendationStatus['versions'][number]

function formatAuc(value: unknown): string {
  return typeof value === 'number' ? value.toFixed(3) : '-'
}

function aucOf(version: Version): { active: unknown; candidate: unknown } | null {
  const evaluation = version.eval
  if (typeof evaluation !== 'object' || evaluation === null || !('auc_candidate' in evaluation)) {
    return null
  }
  return {
    active: 'auc_active' in evaluation ? evaluation.auc_active : null,
    candidate: evaluation.auc_candidate,
  }
}

export function RecommendationTab() {
  const t = useMessages()
  const notify = useNotify()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.recommendationStatus,
    queryFn: fetchRecommendationStatus,
  })
  const status = query.data
  const active = status?.active ?? null
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? active?.body ?? ''
  const save = useMutation({
    mutationFn: savePreference,
    onSuccess: async () => {
      setDraft(null)
      notify(t.settings.recommendation.saved)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.recommendationStatus }),
        queryClient.invalidateQueries({ queryKey: queryKeys.recommendations }),
      ])
    },
  })

  return (
    <SettingsPanel
      title={t.settings.recommendation.title}
      description={t.settings.recommendation.description}
    >
      <SettingsSection title={t.settings.recommendation.keys}>
        {status ? (
          <ul className="text-sm text-fg-muted">
            <li>{t.settings.recommendation.keyStatus('JEV_API_KEY', status.configured.jev)}</li>
            <li>
              {t.settings.recommendation.keyStatus('OPENAI_API_KEY', status.configured.openai)}
            </li>
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">{t.common.loading}</p>
        )}
      </SettingsSection>
      <SettingsSection
        title={t.settings.recommendation.preference}
        description={t.settings.recommendation.preferenceHelp}
      >
        <Label htmlFor="recommendation-preference" className="sr-only">
          {t.settings.recommendation.preference}
        </Label>
        <Textarea
          id="recommendation-preference"
          rows={8}
          maxLength={4000}
          value={value}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={save.isPending || value.trim().length === 0 || value === active?.body}
          onClick={() => save.mutate(value)}
        >
          {t.settings.recommendation.save}
        </Button>
        {status ? (
          <p className="text-sm text-fg-muted">
            {t.settings.recommendation.feedback(
              status.labels.total,
              status.labels.positive,
              status.labels.negative,
            )}
          </p>
        ) : null}
      </SettingsSection>
      <SettingsSection title={t.settings.recommendation.history}>
        <SettingsList
          count={status?.versions.length ?? 0}
          empty={status ? t.settings.recommendation.noHistory : t.common.loading}
        >
          {(status?.versions ?? []).map((version) => {
            const auc = aucOf(version)
            return (
              <SettingsListItem key={version.id}>
                <div className="font-medium">
                  #{version.id} {t.settings.recommendation.status[version.status]} ·{' '}
                  {t.settings.recommendation.source[version.source]}
                </div>
                <div className="text-fg-muted">{formatDateTime(version.created_at)}</div>
                {auc ? (
                  <div className="text-fg-muted tabular-nums">
                    {t.settings.recommendation.auc(formatAuc(auc.active), formatAuc(auc.candidate))}
                  </div>
                ) : null}
                {version.rationale ? <p className="mt-1">{version.rationale}</p> : null}
                <details className="mt-1">
                  <summary className="cursor-pointer text-fg-muted select-none hover:text-fg">
                    {t.settings.recommendation.preference}
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap">{version.body}</p>
                </details>
              </SettingsListItem>
            )
          })}
        </SettingsList>
      </SettingsSection>
    </SettingsPanel>
  )
}
