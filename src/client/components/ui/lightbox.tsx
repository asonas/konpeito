import { Dialog } from '@base-ui/react/dialog'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { useRegisterDialogOpen } from './dialog.tsx'

export function ImageLightbox(props: { src: string | null; onClose: () => void }) {
  const t = useMessages()
  const open = props.src !== null
  useRegisterDialogOpen(open)

  function close() {
    props.onClose()
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop data-slot="lightbox-backdrop" className="fixed inset-0 z-50 scrim" />
        <Dialog.Popup
          data-slot="lightbox"
          aria-label={t.common.image}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-transparent p-0 outline-none"
          onClick={close}
        >
          <Dialog.Title className="sr-only">{t.common.image}</Dialog.Title>
          {props.src ? (
            <img
              src={props.src}
              alt=""
              data-slot="lightbox-image"
              className="h-auto max-h-[100dvh] w-auto max-w-[100dvw] object-contain"
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
