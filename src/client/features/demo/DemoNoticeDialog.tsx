import { Dialog } from '@base-ui/react/dialog'
import { useRegisterDialogOpen } from '../../components/ui/dialog.tsx'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { DemoAbout } from './DemoAbout.tsx'

export function DemoNoticeDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useMessages()
  useRegisterDialogOpen(props.open)
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop data-slot="dialog-backdrop" className="fixed inset-0 z-40 scrim" />
        <Dialog.Popup
          aria-label={t.demo.label}
          className="fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-overlay p-4 text-sm shadow-lg outline-none sm:max-w-sm"
        >
          <Dialog.Title className="sr-only">{t.demo.label}</Dialog.Title>
          <DemoAbout />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
