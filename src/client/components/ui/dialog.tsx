import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { cn } from '../../lib/utils.ts'

const DialogOpenCountContext = createContext<{
  increment: () => void
  decrement: () => void
} | null>(null)

const DialogOpenStateContext = createContext(false)

export function DialogOpenProvider(props: { children: ReactNode }) {
  const [count, setCount] = useState(0)
  const [registry] = useState(() => ({
    increment: () => {
      setCount((value) => value + 1)
    },
    decrement: () => {
      setCount((value) => Math.max(0, value - 1))
    },
  }))
  return (
    <DialogOpenCountContext.Provider value={registry}>
      <DialogOpenStateContext.Provider value={count > 0}>
        {props.children}
      </DialogOpenStateContext.Provider>
    </DialogOpenCountContext.Provider>
  )
}

export function useAnyDialogOpen(): boolean {
  return useContext(DialogOpenStateContext)
}

export function useRegisterDialogOpen(open: boolean): void {
  const registry = useContext(DialogOpenCountContext)
  useEffect(() => {
    if (!open || registry === null) {
      return
    }
    registry.increment()
    return () => {
      registry.decrement()
    }
  }, [open, registry])
}

function DialogFooter(props: { children: ReactNode; className?: string; bordered?: boolean }) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex shrink-0 flex-col-reverse gap-2 p-4 sm:flex-row sm:items-center sm:justify-end',
        props.bordered !== false && 'border-t border-line',
        props.className,
      )}
    >
      {props.children}
    </div>
  )
}

export function AppDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  className?: string
  contentClassName?: string
  bodyLayout?: 'scroll' | 'fill'
  size?: 'default' | 'lg'
}) {
  const t = useMessages()
  useRegisterDialogOpen(props.open)
  const large = props.size === 'lg'
  const hasChildren = props.children !== undefined && props.children !== null
  const hasFooter = props.footer != null
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop data-slot="dialog-backdrop" className="fixed inset-0 z-40 scrim" />
        <Dialog.Popup
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-line bg-overlay shadow-lg outline-none',
            large
              ? 'h-[min(40rem,calc(100dvh-2rem))] w-[min(48rem,calc(100vw-2rem))]'
              : 'w-full max-h-[min(40rem,calc(100dvh-2rem))] max-w-[calc(100%-2rem)] sm:max-w-lg',
            props.className,
          )}
        >
          <div
            data-slot="dialog-header"
            className="flex shrink-0 flex-col border-b border-line p-4"
          >
            <div className="flex items-center gap-4">
              <Dialog.Title className="min-w-0 flex-1 text-lg leading-none font-semibold">
                {props.title}
              </Dialog.Title>
              <Dialog.Close
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-state-hover hover:text-fg"
                aria-label={t.common.close}
              >
                <X className="size-4" />
              </Dialog.Close>
            </div>
            {props.description !== undefined ? (
              <Dialog.Description className="pt-2 text-sm text-fg-muted">
                {props.description}
              </Dialog.Description>
            ) : null}
          </div>
          {hasChildren ? (
            <div
              data-slot="dialog-body"
              className={cn(
                'min-h-0 flex-1',
                props.bodyLayout === 'fill'
                  ? 'flex flex-col overflow-hidden'
                  : 'overflow-y-auto p-4',
                props.contentClassName,
              )}
            >
              {props.children}
            </div>
          ) : null}
          {hasFooter ? <DialogFooter bordered={hasChildren}>{props.footer}</DialogFooter> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
