import { AlertDialog } from '@base-ui/react/alert-dialog'
import type { LucideIcon } from 'lucide-react'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { Button } from './button.tsx'
import { useRegisterDialogOpen } from './dialog.tsx'

export function ConfirmDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  confirmVariant?: 'default' | 'destructive'
  icon?: LucideIcon
  onConfirm: () => void | Promise<void>
  busy?: boolean
}) {
  const t = useMessages()
  useRegisterDialogOpen(props.open)
  const variant = props.confirmVariant ?? 'destructive'
  const Icon = props.icon
  return (
    <AlertDialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop
          data-slot="alert-dialog-overlay"
          className="fixed inset-0 z-40 scrim"
        />
        <AlertDialog.Popup
          data-slot="alert-dialog-content"
          className="fixed top-1/2 left-1/2 z-50 flex w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-line bg-overlay shadow-lg outline-none sm:max-w-xs"
        >
          <div
            data-slot="alert-dialog-header"
            className="flex flex-col items-center gap-2 p-4 text-center"
          >
            {Icon !== undefined ? (
              <div
                data-slot="alert-dialog-media"
                className={`mb-1 flex size-10 items-center justify-center rounded-xl [&_svg]:size-5 ${
                  variant === 'destructive'
                    ? 'bg-danger-surface text-danger-text'
                    : 'bg-accent-surface text-accent-text'
                }`}
              >
                <Icon aria-hidden="true" />
              </div>
            ) : null}
            <AlertDialog.Title className="text-lg leading-snug font-semibold">
              {props.title}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-fg-muted">
              {props.description}
            </AlertDialog.Description>
          </div>
          <div
            data-slot="alert-dialog-footer"
            className="grid grid-cols-2 gap-2 border-t border-line p-4"
          >
            <AlertDialog.Close render={<Button variant="outline" />}>
              {t.common.cancel}
            </AlertDialog.Close>
            <Button
              data-slot="alert-dialog-action"
              variant={variant}
              disabled={props.busy}
              onClick={() => {
                void props.onConfirm()
              }}
            >
              {props.confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
