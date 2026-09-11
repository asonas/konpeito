import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '../../../components/ui/alert-dialog.tsx'
import { Button, buttonVariants } from '../../../components/ui/button.tsx'
import { FileButton } from '../../../components/ui/file-button.tsx'
import { Label } from '../../../components/ui/label.tsx'
import { Textarea } from '../../../components/ui/textarea.tsx'
import { useMessages } from '../../../i18n/I18nProvider.tsx'
import { errorMessage } from '../../../lib/http.ts'
import { useNotify } from '../../../lib/notify.ts'
import { importOpml, OPML_EXPORT_URL, queryKeys, refreshAllFeeds } from '../../../lib/queries.ts'
import { SettingsPanel, SettingsSection } from '../SettingsPanel.tsx'

export function DataTab(props: { feedCount: number }) {
  const t = useMessages()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [opml, setOpml] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [refreshConfirm, setRefreshConfirm] = useState(false)
  const [refreshState, setRefreshState] = useState<'idle' | 'running' | 'done'>('idle')

  async function runImport(xml: string) {
    if (xml.trim().length === 0) {
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await importOpml(xml)
      await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
      const next = t.settings.data.imported(result.imported)
      setMessage(next)
      notify(next)
      setOpml('')
    } catch (error) {
      const next = errorMessage(error, t.settings.data.importFailed)
      setMessage(next)
      notify(next, 'destructive')
    } finally {
      setBusy(false)
    }
  }

  async function refreshAll() {
    setRefreshState('running')
    try {
      await refreshAllFeeds()
      setRefreshState('done')
      notify(t.settings.data.refreshAllQueued)
    } catch (error) {
      setRefreshState('idle')
      notify(errorMessage(error, t.settings.data.refreshAllFailed), 'destructive')
    } finally {
      setRefreshConfirm(false)
    }
  }

  return (
    <SettingsPanel title={t.settings.data.title}>
      <SettingsSection
        title={t.settings.data.opmlTitle}
        description={t.settings.data.opmlDescription}
      >
        <div className="flex flex-wrap gap-2">
          <FileButton
            accept=".opml,.xml,text/xml"
            onFile={(file) => {
              void file.text().then((xml) => runImport(xml))
            }}
          >
            {t.settings.data.importFile}
          </FileButton>
          <a
            href={OPML_EXPORT_URL}
            download="subscriptions.opml"
            className={buttonVariants({ variant: 'outline' })}
          >
            {t.settings.data.exportOpml}
          </a>
        </div>
        <details className="group">
          <summary className="cursor-pointer text-sm text-fg-muted select-none hover:text-fg">
            {t.settings.data.importPaste}
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            <Label htmlFor="opml-paste" className="sr-only">
              {t.settings.data.opmlText}
            </Label>
            <Textarea
              id="opml-paste"
              value={opml}
              placeholder="<opml version=&quot;2.0&quot;>…"
              onChange={(event) => setOpml(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={busy || opml.trim().length === 0}
              onClick={() => void runImport(opml)}
            >
              {t.settings.data.importPasted}
            </Button>
          </div>
        </details>
        {message ? (
          <p className="text-sm text-fg-muted" role="status">
            {message}
          </p>
        ) : null}
      </SettingsSection>
      <SettingsSection
        title={t.settings.data.refreshTitle}
        description={t.settings.data.refreshDescription}
      >
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={refreshState === 'running' || props.feedCount === 0}
          onClick={() => setRefreshConfirm(true)}
        >
          {t.settings.data.refreshAll}
        </Button>
        {refreshState === 'running' ? (
          <p className="text-sm text-fg-muted">{t.settings.data.refreshQueued}</p>
        ) : null}
        {refreshState === 'done' ? (
          <p className="text-sm text-fg-muted">{t.settings.data.refreshAllQueued}</p>
        ) : null}
      </SettingsSection>
      <ConfirmDialog
        open={refreshConfirm}
        onOpenChange={setRefreshConfirm}
        title={t.settings.data.refreshConfirmTitle}
        description={t.settings.data.refreshConfirmBody(props.feedCount)}
        confirmLabel={t.settings.data.refreshConfirm}
        confirmVariant="default"
        icon={RefreshCw}
        busy={refreshState === 'running'}
        onConfirm={() => void refreshAll()}
      />
    </SettingsPanel>
  )
}
