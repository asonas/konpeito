import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/ui/button.tsx'
import { AppDialog } from '../../components/ui/dialog.tsx'
import { Input } from '../../components/ui/input.tsx'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { errorMessage } from '../../lib/http.ts'
import { useNotify } from '../../lib/notify.ts'
import { createTag, queryKeys, renameTag, type Tag } from '../../lib/queries.ts'

export function TagNameDialog(props: {
  open: boolean
  tag: Tag | null
  onOpenChange: (open: boolean) => void
}) {
  const t = useMessages()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [name, setName] = useState(props.tag?.name ?? '')
  const [busy, setBusy] = useState(false)
  const trimmed = name.trim()
  const creating = props.tag === null
  const formId = 'tag-name'

  async function submit() {
    if (trimmed.length === 0) {
      return
    }
    setBusy(true)
    try {
      if (props.tag) {
        await renameTag(props.tag.id, trimmed)
      } else {
        await createTag(trimmed)
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
      props.onOpenChange(false)
    } catch (error) {
      notify(
        errorMessage(error, creating ? t.tagDialog.createFailed : t.common.saveFailed),
        'destructive',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={creating ? t.tagDialog.createTitle : t.tagDialog.renameTitle}
      footer={
        <>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form={formId} disabled={busy || trimmed.length === 0}>
            {creating ? t.common.create : t.common.save}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label={t.tagDialog.nameLabel}
          placeholder={t.tagDialog.nameLabel}
        />
      </form>
    </AppDialog>
  )
}
