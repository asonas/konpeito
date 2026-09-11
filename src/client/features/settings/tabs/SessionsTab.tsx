import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldOff } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '../../../components/ui/alert-dialog.tsx'
import { Button } from '../../../components/ui/button.tsx'
import { useMessages } from '../../../i18n/I18nProvider.tsx'
import { formatDateTime } from '../../../lib/format.ts'
import { errorMessage } from '../../../lib/http.ts'
import { useNotify } from '../../../lib/notify.ts'
import { fetchSessions, queryKeys, revokeSession } from '../../../lib/queries.ts'
import { Badge, SettingsList, SettingsListItem, SettingsPanel } from '../SettingsPanel.tsx'

interface PendingRevoke {
  id: string
  current: boolean
  name: string
}

export function SessionsTab() {
  const t = useMessages()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [pending, setPending] = useState<PendingRevoke | null>(null)
  const [busy, setBusy] = useState(false)
  const query = useQuery({ queryKey: queryKeys.sessions, queryFn: fetchSessions })
  const sessions = query.data?.sessions ?? []

  async function revoke() {
    if (!pending) {
      return
    }
    setBusy(true)
    try {
      await revokeSession(pending.id)
      if (pending.current) {
        window.location.href = '/login'
        return
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
      notify(t.settings.sessions.revoked)
      setPending(null)
    } catch (error) {
      notify(errorMessage(error, t.settings.sessions.revokeFailed), 'destructive')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsPanel title={t.settings.sessions.title} description={t.settings.sessions.description}>
      <SettingsList
        count={sessions.length}
        empty={query.data ? t.settings.sessions.empty : t.common.loading}
      >
        {sessions.map((session) => {
          const name = session.user_agent ?? t.settings.sessions.unknownDevice
          return (
            <SettingsListItem
              key={session.id}
              actions={
                <Button
                  size="sm"
                  variant="destructive-outline"
                  onClick={() => setPending({ id: session.id, current: session.current, name })}
                >
                  {t.settings.sessions.revoke}
                </Button>
              }
            >
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{name}</span>
                {session.current ? <Badge>{t.settings.sessions.current}</Badge> : null}
              </div>
              <div className="text-fg-muted">
                {t.settings.sessions.lastSeen(formatDateTime(session.last_seen_at))}
              </div>
            </SettingsListItem>
          )
        })}
      </SettingsList>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPending(null)
          }
        }}
        title={
          pending?.current
            ? t.settings.sessions.revokeCurrentTitle
            : t.settings.sessions.revokeOtherTitle
        }
        description={
          pending?.current
            ? t.settings.sessions.revokeCurrentBody
            : t.settings.sessions.revokeOtherBody(pending?.name ?? '')
        }
        confirmLabel={t.settings.sessions.revokeConfirm}
        icon={ShieldOff}
        busy={busy}
        onConfirm={revoke}
      />
    </SettingsPanel>
  )
}
