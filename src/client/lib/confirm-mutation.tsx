import { useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '../components/ui/alert-dialog.tsx'
import { errorMessage } from './http.ts'
import { useNotify } from './notify.ts'
import { queryKeys } from './queries.ts'

export function ConfirmMutationDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  icon?: LucideIcon
  mutate: () => Promise<void>
  succeeded: string
  failed: string
  onDone?: () => void
}) {
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await props.mutate()
      await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
      notify(props.succeeded)
      props.onOpenChange(false)
      props.onDone?.()
    } catch (error) {
      notify(errorMessage(error, props.failed), 'destructive')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.title}
      description={props.description}
      confirmLabel={props.confirmLabel}
      {...(props.icon !== undefined ? { icon: props.icon } : {})}
      busy={busy}
      onConfirm={confirm}
    />
  )
}
