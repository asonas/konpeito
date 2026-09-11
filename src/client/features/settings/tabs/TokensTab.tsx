import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldOff } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '../../../components/ui/alert-dialog.tsx'
import { Button } from '../../../components/ui/button.tsx'
import { Input } from '../../../components/ui/input.tsx'
import { Field, Label } from '../../../components/ui/label.tsx'
import { useMessages } from '../../../i18n/I18nProvider.tsx'
import { formatDateTime } from '../../../lib/format.ts'
import { errorMessage } from '../../../lib/http.ts'
import { useNotify } from '../../../lib/notify.ts'
import { createToken, fetchTokens, queryKeys, revokeToken } from '../../../lib/queries.ts'
import {
  SettingsList,
  SettingsListItem,
  SettingsPanel,
  SettingsSection,
} from '../SettingsPanel.tsx'

export function TokensTab() {
  const t = useMessages()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [name, setName] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [pending, setPending] = useState<{ id: number; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const query = useQuery({ queryKey: queryKeys.tokens, queryFn: fetchTokens })
  const tokens = query.data?.tokens ?? []

  async function create() {
    try {
      const created = await createToken(name)
      setSecret(created.secret)
      setName('')
      await queryClient.invalidateQueries({ queryKey: queryKeys.tokens })
      notify(t.settings.tokens.issued)
    } catch (error) {
      notify(errorMessage(error, t.settings.tokens.issueFailed), 'destructive')
    }
  }

  async function revoke() {
    if (!pending) {
      return
    }
    setBusy(true)
    try {
      await revokeToken(pending.id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.tokens })
      notify(t.settings.tokens.revoked)
      setPending(null)
    } catch (error) {
      notify(errorMessage(error, t.settings.tokens.revokeFailed), 'destructive')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsPanel title={t.settings.tokens.title} description={t.settings.tokens.description}>
      <SettingsSection title={t.settings.tokens.issueTitle}>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          <Field>
            <Label htmlFor="token-name">{t.settings.tokens.name}</Label>
            <div className="flex gap-2">
              <Input
                id="token-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Button type="submit" variant="outline" disabled={name.length === 0}>
                {t.settings.tokens.issue}
              </Button>
            </div>
          </Field>
        </form>
        {secret ? (
          <div role="status" className="rounded-md border border-line bg-sunken p-3">
            <p className="text-sm font-medium">{t.settings.tokens.newToken}</p>
            <p className="mt-1 font-mono text-sm break-all select-all">{secret}</p>
            <p className="mt-1 text-xs text-fg-muted">{t.settings.tokens.showOnce}</p>
          </div>
        ) : null}
      </SettingsSection>
      <SettingsSection title={t.settings.tokens.listTitle}>
        <SettingsList
          count={tokens.length}
          empty={query.data ? t.settings.tokens.empty : t.common.loading}
        >
          {tokens.map((token) => (
            <SettingsListItem
              key={token.id}
              actions={
                <Button
                  size="sm"
                  variant="destructive-outline"
                  onClick={() => setPending({ id: token.id, name: token.name })}
                >
                  {t.settings.tokens.revoke}
                </Button>
              }
            >
              <div className="truncate font-medium">{token.name}</div>
              <div className="text-fg-muted">
                {t.settings.tokens.issuedAt(formatDateTime(token.created_at))}
              </div>
            </SettingsListItem>
          ))}
        </SettingsList>
      </SettingsSection>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPending(null)
          }
        }}
        title={t.settings.tokens.revokeTitle}
        description={t.settings.tokens.revokeBody(pending?.name ?? '')}
        confirmLabel={t.settings.tokens.revokeConfirm}
        icon={ShieldOff}
        busy={busy}
        onConfirm={revoke}
      />
    </SettingsPanel>
  )
}
